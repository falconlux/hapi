import { describe, expect, it } from 'bun:test'
import { RpcRegistry } from '../socket/rpcRegistry'
import { Store } from '../store'
import { SyncEngine } from './syncEngine'

async function waitFor(predicate: () => boolean, timeoutMs: number = 1_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!predicate()) {
        if (Date.now() >= deadline) throw new Error('Timed out waiting for condition')
        await new Promise((resolve) => setTimeout(resolve, 0))
    }
}

function createEngine(store: Store) {
    const cliEmitted: unknown[][] = []
    const sseEvents: Array<{ type: string; sessionId?: string }> = []
    const io = {
        of() {
            return {
                to() {
                    return {
                        emit(...args: unknown[]) {
                            cliEmitted.push(args)
                        }
                    }
                }
            }
        }
    }
    const sseManager = {
        broadcast(event: { type: string; sessionId?: string }) {
            sseEvents.push(event)
        }
    }
    const engine = new SyncEngine(store, io as never, new RpcRegistry(), sseManager as never)
    return { engine, cliEmitted, sseEvents }
}

function createHarness(childCount: number = 1, childPath: string = '/tmp/project') {
    const store = new Store(':memory:')
    const { engine, cliEmitted, sseEvents } = createEngine(store)
    const manager = engine.getOrCreateSession(
        'manager-tag',
        { path: '/tmp/project', host: 'localhost', name: 'Manager', flavor: 'codex' },
        null,
        'default'
    )
    engine.handleSessionAlive({ sid: manager.id, time: Date.now() })
    const children = Array.from({ length: childCount }, (_, index) => {
        const child = engine.getOrCreateSession(
            `child-tag-${index}`,
            { ...(childPath ? { path: childPath } : {}), host: 'localhost', name: `Worker ${index}`, flavor: 'codex' },
            null,
            'default'
        )
        engine.setSessionManager(child.id, manager.id, 'default')
        return child
    })
    return { store, engine, manager, children, cliEmitted, sseEvents }
}

describe('manager-linked agent sessions', () => {
    it('does not report expected archive/delete lifecycle control as failed', async () => {
        const { engine, children: [child] } = createHarness()
        const messages: string[] = []
        engine.sendMessage = async (_sessionId, payload) => { messages.push(payload.text) }
        const gateway = (engine as unknown as { rpcGateway: { killSession: (sessionId: string) => Promise<void> } }).rpcGateway
        gateway.killSession = async () => {}

        await engine.archiveSession(child!.id)
        await engine.deleteSession(child!.id)
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(messages).toEqual([])
        expect(engine.getSession(child!.id)).toBeUndefined()
        engine.stop()
    })

    it('does not notify for duplicate or concurrent expected stop events', async () => {
        const { store, engine, children: [child] } = createHarness()
        const { engine: rival } = createEngine(store)
        let sends = 0
        engine.sendMessage = async () => { sends += 1 }
        rival.sendMessage = async () => { sends += 1 }

        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'terminated' })
        rival.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'terminated' })
        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'handoff' })
        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'cleared' })
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(sends).toBe(0)
        expect(engine.getSession(child!.id)?.metadata?.managerNotificationState?.terminal).toBeUndefined()
        engine.stop()
        rival.stop()
    })

    it('still reports genuine agent errors as failed', async () => {
        const { engine, manager, children: [child] } = createHarness()
        const messages: Array<{ sessionId: string; text: string }> = []
        engine.sendMessage = async (sessionId, payload) => { messages.push({ sessionId, text: payload.text }) }

        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'error' })
        await waitFor(() => messages.length === 1)

        expect(messages[0]).toEqual({
            sessionId: manager.id,
            text: `[HAPI agent notification] Child session "Worker 0" (${child!.id}) failed. Use inspect_peer for details if needed.`
        })
        engine.stop()
    })

    it('does not notify a linked manager when either canonical project is missing or different', async () => {
        for (const childPath of ['/tmp/other']) {
            const { engine, children: [child] } = createHarness(1, childPath)
            let sends = 0
            engine.sendMessage = async () => { sends += 1 }

            engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'completed' })
            await new Promise((resolve) => setTimeout(resolve, 0))

            expect(sends).toBe(0)
            expect(engine.getSession(child!.id)?.metadata?.managerNotificationState?.terminal).toBeUndefined()
            engine.stop()
        }
    })

    it('sends one terminal notification for sequential duplicate and conflicting end events', async () => {
        const { engine, manager, children: [child] } = createHarness()
        const messages: Array<{ sessionId: string; text: string; localId?: string | null }> = []
        engine.sendMessage = async (sessionId, payload) => {
            messages.push({ sessionId, text: payload.text, localId: payload.localId })
        }

        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'completed' })
        await waitFor(() => messages.length === 1)
        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'completed' })
        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'error' })
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(messages).toEqual([{
            sessionId: manager.id,
            text: `[HAPI agent notification] Child session "Worker 0" (${child!.id}) completed. Use inspect_peer for details if needed.`,
            localId: `manager-notification:terminal:${manager.id}:${child!.id}:completed`
        }])
        expect(engine.getSession(child!.id)?.metadata?.managerNotificationState?.terminal?.status).toBe('sent')
        expect(engine.getSession(child!.id)?.metadata?.managerNotificationState?.terminal).toMatchObject({
            managerSessionId: manager.id,
            childSessionId: child!.id,
            terminalState: 'completed'
        })
        engine.stop()
    })

    it('claims concurrent conflicting end events across independent caches before either can deliver', async () => {
        const { store, engine, children: [child] } = createHarness()
        const { engine: rival } = createEngine(store)
        let releaseSend!: () => void
        const blocked = new Promise<void>((resolve) => { releaseSend = resolve })
        let sends = 0
        engine.sendMessage = async () => {
            sends += 1
            await blocked
        }
        rival.sendMessage = async () => {
            sends += 1
            await blocked
        }

        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'completed' })
        rival.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'error' })
        await waitFor(() => sends === 1)
        expect(sends).toBe(1)
        releaseSend()
        await waitFor(() => engine.getSession(child!.id)?.metadata?.managerNotificationState?.terminal?.status === 'sent')
        expect(sends).toBe(1)
        expect(engine.getSession(child!.id)?.metadata?.managerNotificationState?.terminal?.terminalState).toBe('completed')
        engine.stop()
        rival.stop()
    })

    it('retries after a post-persistence send failure without duplicate CLI or SSE delivery', async () => {
        const { store, engine, manager, children: [child], cliEmitted, sseEvents } = createHarness()
        const sendMessage = engine.sendMessage.bind(engine)
        let attempts = 0
        engine.sendMessage = async (sessionId, payload) => {
            attempts += 1
            await sendMessage(sessionId, payload)
            if (attempts === 1) throw new Error('simulated post-persistence send failure')
        }

        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'error' })
        await waitFor(() => engine.getSession(child!.id)?.metadata?.managerNotificationState?.terminal?.status === 'pending')
        const replacementManager = engine.getOrCreateSession(
            'replacement-manager',
            { path: '/tmp/project', host: 'localhost', name: 'Replacement Manager', flavor: 'codex' },
            null,
            'default'
        )
        engine.handleSessionAlive({ sid: replacementManager.id, time: Date.now() })
        engine.setSessionManager(child!.id, replacementManager.id, 'default')
        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'completed' })
        await waitFor(() => engine.getSession(child!.id)?.metadata?.managerNotificationState?.terminal?.status === 'sent')

        expect(attempts).toBe(2)
        expect(engine.getSession(child!.id)?.metadata?.managerNotificationState?.terminal).toMatchObject({
            managerSessionId: manager.id,
            childSessionId: child!.id,
            terminalState: 'failed'
        })
        expect(cliEmitted.filter(([event]) => event === 'update')).toHaveLength(1)
        expect(sseEvents.filter((event) => event.type === 'message-received' && event.sessionId === manager.id)).toHaveLength(1)
        expect(store.messages.getUninvokedLocalMessages(manager.id).map((message) => message.localId)).toEqual([
            `manager-notification:terminal:${manager.id}:${child!.id}:failed`
        ])
        expect(store.messages.getUninvokedLocalMessages(replacementManager.id)).toHaveLength(0)
        engine.stop()
    })

    it('keeps checkpoint claims separate from the terminal claim', async () => {
        const { store, engine, manager, children: [child] } = createHarness()
        const stored = store.sessions.getSessionByNamespace(child!.id, 'default')!
        const checkpoint = {
            eventType: 'checkpoint' as const,
            managerSessionId: manager.id,
            childSessionId: child!.id,
            status: 'sent' as const,
            updatedAt: Date.now()
        }
        const seeded = store.sessions.updateSessionMetadata(
            child!.id,
            {
                ...stored.metadata as Record<string, unknown>,
                managerNotificationState: { checkpoints: { 'checkpoint-1': checkpoint } }
            },
            stored.metadataVersion,
            'default',
            { touchUpdatedAt: false }
        )
        expect(seeded.result).toBe('success')
        engine.sendMessage = async () => {}

        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'completed' })
        await waitFor(() => engine.getSession(child!.id)?.metadata?.managerNotificationState?.terminal?.status === 'sent')

        expect(engine.getSession(child!.id)?.metadata?.managerNotificationState?.checkpoints).toEqual({
            'checkpoint-1': checkpoint
        })
        engine.stop()
    })

    it('delivers one terminal notification for each different child', async () => {
        const { engine, children } = createHarness(2)
        const deliveredChildIds: string[] = []
        engine.sendMessage = async (_sessionId, payload) => {
            const child = children.find((candidate) => payload.text.includes(candidate.id))
            if (child) deliveredChildIds.push(child.id)
        }

        for (const child of children) {
            engine.handleSessionEnd({ sid: child.id, time: Date.now(), reason: 'completed' })
        }
        await waitFor(() => deliveredChildIds.length === 2)

        expect(deliveredChildIds.sort()).toEqual(children.map((child) => child.id).sort())
        engine.stop()
    })

    it('keeps the sent claim across a SyncEngine restart', async () => {
        const { store, engine, children: [child] } = createHarness()
        let sends = 0
        engine.sendMessage = async () => { sends += 1 }
        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'completed' })
        await waitFor(() => engine.getSession(child!.id)?.metadata?.managerNotificationState?.terminal?.status === 'sent')
        engine.stop()

        const restarted = new SyncEngine(store, {} as never, new RpcRegistry(), { broadcast() {} } as never)
        restarted.sendMessage = async () => { sends += 1 }
        restarted.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'completed' })
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(sends).toBe(1)
        restarted.stop()
    })

    it('resumes an inactive manager before delivering the fallback notification', async () => {
        const { engine, manager, children: [child] } = createHarness()
        engine.handleSessionEnd({ sid: manager.id, time: Date.now() })
        let resumed = false
        engine.resumeSession = async () => {
            resumed = true
            return { type: 'success', sessionId: manager.id }
        }
        const messages: string[] = []
        engine.sendMessage = async (_sessionId, payload) => { messages.push(payload.text) }

        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'error' })
        await waitFor(() => messages.length === 1)

        expect(resumed).toBe(true)
        expect(messages[0]).toContain('failed')
        engine.stop()
    })
})
