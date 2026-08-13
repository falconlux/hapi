import {
    CreateAgentSessionRequestSchema,
    MACHINE_DISPLAY_NAME_MAX_LENGTH,
    MachineListDirectoryRequestSchema,
    MachinePathsExistsRequestSchema,
    RenameMachineRequestSchema,
    SpawnSessionRequestSchema
} from '@hapi/protocol'
import { Hono } from 'hono'
import { RPC_TARGET_MISSING_ERROR_CODE } from '@hapi/protocol/rpcMethods'
import type { SyncEngine } from '../../sync/syncEngine'
import { RpcTargetMissingError } from '../../sync/rpcGateway'
import type { WebAppEnv } from '../middleware/auth'
import { requireMachine } from './guards'
import { getCanonicalSessionProjectKey, normalizeSessionProjectKey } from '@hapi/protocol'

export function createMachinesRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()
    const agentSessionCreatesInFlight = new Set<string>()

    app.get('/machines', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const namespace = c.get('namespace')
        const machines = engine.getOnlineMachinesByNamespace(namespace)
        return c.json({ machines })
    })

    app.patch('/machines/:id', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = RenameMachineRequestSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body: displayName is required' }, 400)
        }

        // Trim first: a name is stored trimmed, so the ceiling applies to what
        // actually gets stored. An empty result clears the custom name.
        const displayName = parsed.data.displayName.trim()
        if (displayName.length > MACHINE_DISPLAY_NAME_MAX_LENGTH) {
            return c.json({ error: `displayName must be at most ${MACHINE_DISPLAY_NAME_MAX_LENGTH} characters` }, 400)
        }

        try {
            await engine.renameMachine(machineId, displayName)
            return c.json({ ok: true })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to rename machine'
            // Match the session rename contract: contention maps to 409.
            if (message.includes('concurrently') || message.includes('version')) {
                return c.json({ error: message }, 409)
            }
            return c.json({ error: message }, 500)
        }
    })

    app.post('/machines/:id/spawn', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = SpawnSessionRequestSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        if (parsed.data.agent === 'agy' && parsed.data.startingMode === 'remote') {
            return c.json({ error: 'AGY only supports PTY mode' }, 400)
        }
        const startingMode = parsed.data.agent === 'agy'
            ? 'pty'
            : parsed.data.startingMode

        const result = await engine.spawnSession(
            machineId,
            parsed.data.directory,
            parsed.data.agent,
            parsed.data.model,
            parsed.data.modelReasoningEffort,
            parsed.data.yolo,
            parsed.data.sessionType,
            parsed.data.worktreeName,
            undefined, // resumeSessionId
            parsed.data.effort,
            parsed.data.permissionMode,
            parsed.data.serviceTier,
            undefined,
            parsed.data.collaborationMode,
            parsed.data.copilotAgentMode,
            startingMode
        )
        return c.json(result)
    })

    app.post('/machines/:id/agent-sessions', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ type: 'error', error: 'Not connected', code: 'not_connected' }, 503)

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) return machine

        const body = await c.req.json().catch(() => null)
        const parsed = CreateAgentSessionRequestSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({
                type: 'error',
                error: 'Invalid body: title, cwd, and initialMessage/objective are required',
                code: 'invalid_request'
            }, 400)
        }

        const namespace = c.get('namespace')
        const title = parsed.data.title.trim()
        const cwd = parsed.data.cwd.trim().replace(/[\\/]+$/, '') || parsed.data.cwd.trim()
        const managerSessionId = parsed.data.managerSessionId
        const managerSession = managerSessionId
            ? engine.getSessionByNamespace(managerSessionId, namespace)
            : undefined
        if (managerSessionId && !managerSession) {
            return c.json({
                type: 'error',
                error: 'managerSessionId is not available in this namespace',
                code: 'invalid_manager_session'
            }, 400)
        }
        if (managerSessionId) {
            const managerProjectKey = getCanonicalSessionProjectKey(managerSession?.metadata)
            const requestedProjectKey = normalizeSessionProjectKey(cwd)
            if (!managerProjectKey || !requestedProjectKey || managerProjectKey !== requestedProjectKey) {
                return c.json({
                    type: 'error',
                    error: 'managerSessionId and cwd must belong to the same canonical project',
                    code: 'manager_project_mismatch'
                }, 403)
            }
        }

        const normalizedTitle = title.replace(/\s+/g, ' ').toLowerCase()
        const normalizedCwd = cwd.replace(/[\\/]+$/, '')
        const duplicate = engine.getSessionsByNamespace(namespace).find((session) => {
            const sessionTitle = session.metadata?.name?.trim().replace(/\s+/g, ' ').toLowerCase()
            const sessionCwd = session.metadata?.path?.trim().replace(/[\\/]+$/, '')
            const recent = Date.now() - session.createdAt < 5 * 60_000
            return sessionTitle === normalizedTitle && sessionCwd === normalizedCwd && (session.active || recent)
        })
        if (duplicate) {
            return c.json({
                type: 'error',
                error: `A matching agent session already exists: ${duplicate.id}`,
                code: 'duplicate_agent_session',
                sessionId: duplicate.id
            }, 409)
        }

        const createKey = `${namespace}\u0000${machineId}\u0000${normalizedCwd}\u0000${normalizedTitle}`
        if (agentSessionCreatesInFlight.has(createKey)) {
            return c.json({
                type: 'error',
                error: 'An identical agent session creation is already in progress',
                code: 'duplicate_agent_session'
            }, 409)
        }

        agentSessionCreatesInFlight.add(createKey)
        let sessionId: string | undefined
        try {
            const spawned = await engine.spawnSession(
                machineId,
                cwd,
                'codex',
                parsed.data.model,
                parsed.data.reasoningEffort,
                true
            )
            if (spawned.type !== 'success') {
                return c.json({ type: 'error', error: spawned.message, code: 'spawn_failed' }, 502)
            }
            sessionId = spawned.sessionId

            if (!await engine.waitForSessionActive(sessionId)) {
                return c.json({
                    type: 'error',
                    error: 'Created session did not become active before timeout',
                    code: 'session_start_timeout',
                    sessionId
                }, 504)
            }

            if (managerSessionId) {
                const child = engine.getSessionByNamespace(sessionId, namespace)
                const manager = engine.getSessionByNamespace(managerSessionId, namespace)
                const childProjectKey = getCanonicalSessionProjectKey(child?.metadata)
                const managerProjectKey = getCanonicalSessionProjectKey(manager?.metadata)
                if (!childProjectKey || !managerProjectKey || childProjectKey !== managerProjectKey) {
                    throw new Error('Created child and manager canonical projects do not match')
                }
                engine.setSessionManager(sessionId, managerSessionId, namespace)
            }
            await engine.renameSession(sessionId, title)

            const objective = parsed.data.initialMessage ?? parsed.data.objective ?? ''
            const managerContract = managerSessionId
                ? `\n\n[HAPI manager notification contract]\nManager session: ${managerSessionId}\nAt every material checkpoint and on completion or failure, call ping_peer for this manager session. Use: 产出/SHA/测试/卡点/下一步. Do not wait for the manager to inspect you. The Hub will also send a fallback notification when this child session ends.`
                : ''
            await engine.sendMessage(sessionId, {
                text: `${objective}${managerContract}`,
                localId: `create-agent-session:${sessionId}`,
                sentFrom: 'webapp'
            })

            return c.json({ type: 'success' as const, sessionId })
        } catch (error) {
            return c.json({
                type: 'error',
                error: error instanceof Error ? error.message : String(error),
                code: 'initialization_failed',
                ...(sessionId ? { sessionId } : {})
            }, 500)
        } finally {
            agentSessionCreatesInFlight.delete(createKey)
        }
    })

    app.post('/machines/:id/list-directory', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = MachineListDirectoryRequestSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        try {
            const result = await engine.listMachineDirectory(machineId, parsed.data.path, parsed.data.includeHidden)
            return c.json(result)
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to list directory' }, 500)
        }
    })

    app.post('/machines/:id/paths/exists', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const body = await c.req.json().catch(() => null)
        const parsed = MachinePathsExistsRequestSchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const uniquePaths = Array.from(new Set(parsed.data.paths.map((path) => path.trim()).filter(Boolean)))
        if (uniquePaths.length === 0) {
            return c.json({ exists: {} })
        }

        try {
            const exists = await engine.checkPathsExist(machineId, uniquePaths)
            return c.json({ exists })
        } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : 'Failed to check paths' }, 500)
        }
    })

    app.get('/machines/:id/agy-models', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ success: false, error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        try {
            const result = await engine.listAgyModelsForMachine(machineId)
            return c.json(result)
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to list Agy models'
            }, 500)
        }
    })

    app.get('/machines/:id/codex-models', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ success: false, error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        try {
            const result = await engine.listCodexModelsForMachine(machineId)
            return c.json(result)
        } catch (error) {
            if (error instanceof RpcTargetMissingError) {
                return c.json({
                    success: false,
                    error: error.message,
                    code: RPC_TARGET_MISSING_ERROR_CODE
                }, 503)
            }
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to list Codex models'
            }, 500)
        }
    })

    app.get('/machines/:id/opencode-models', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ success: false, error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const cwd = (c.req.query('cwd') ?? '').trim()
        if (!cwd) {
            return c.json({ success: false, error: 'cwd query parameter is required' }, 400)
        }

        try {
            const result = await engine.listOpencodeModelsForCwd(machineId, cwd)
            return c.json(result)
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to list OpenCode models'
            }, 500)
        }
    })

    app.get('/machines/:id/grok-models', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ success: false, error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) return machine

        const cwd = (c.req.query('cwd') ?? '').trim()
        if (!cwd) {
            return c.json({ success: false, error: 'cwd query parameter is required' }, 400)
        }

        try {
            return c.json(await engine.listGrokModelsForCwd(machineId, cwd))
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to list Grok models'
            }, 500)
        }
    })

    app.get('/machines/:id/copilot-models', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ success: false, error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) return machine

        const cwd = (c.req.query('cwd') ?? '').trim()
        if (!cwd) {
            return c.json({ success: false, error: 'cwd query parameter is required' }, 400)
        }

        try {
            return c.json(await engine.listCopilotModelsForCwd(machineId, cwd))
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to list Copilot models'
            }, 500)
        }
    })

    app.get('/machines/:id/cursor-models', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ success: false, error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        try {
            const result = await engine.listCursorModelsForMachine(machineId)
            return c.json(result)
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to list Cursor models'
            }, 500)
        }
    })

    app.post('/machines/:id/restart-runner', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ error: 'Not connected' }, 503)
        }

        const machineId = c.req.param('id')
        const machine = requireMachine(c, engine, machineId)
        if (machine instanceof Response) {
            return machine
        }

        const result = await engine.restartMachineRunner(machineId, c.get('namespace'))
        if (result.type === 'error') {
            const status = result.code === 'machine_not_found' ? 404
                : result.code === 'machine_offline' ? 503
                    : 502
            return c.json({ error: result.message, code: result.code }, status)
        }
        return c.json({ message: result.message })
    })

    return app
}
