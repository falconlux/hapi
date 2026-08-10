import { describe, expect, it } from 'bun:test'
import { RpcRegistry } from '../socket/rpcRegistry'
import { Store } from '../store'
import { SyncEngine } from './syncEngine'

async function flushAsync(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('manager-linked agent sessions', () => {
    it('persists the manager link and sends an idempotent end notification', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(
            store,
            {} as never,
            new RpcRegistry(),
            { broadcast() {} } as never
        )
        const manager = engine.getOrCreateSession(
            'manager-tag',
            { path: '/tmp/manager', host: 'localhost', name: 'Manager', flavor: 'codex' },
            null,
            'default'
        )
        const child = engine.getOrCreateSession(
            'child-tag',
            { path: '/tmp/child', host: 'localhost', name: 'Worker', flavor: 'codex' },
            null,
            'default'
        )
        engine.handleSessionAlive({ sid: manager.id, time: Date.now() })
        engine.setSessionManager(child.id, manager.id, 'default')
        expect(engine.getSession(child.id)?.metadata?.managerSessionId).toBe(manager.id)

        const messages: Array<{ sessionId: string; text: string; localId?: string | null }> = []
        engine.sendMessage = async (sessionId, payload) => {
            messages.push({ sessionId, text: payload.text, localId: payload.localId })
        }
        engine.handleSessionEnd({ sid: child.id, time: Date.now(), reason: 'completed' })
        await flushAsync()

        expect(messages).toEqual([{
            sessionId: manager.id,
            text: `[HAPI agent notification] Child session "Worker" (${child.id}) completed. Use inspect_peer for details if needed.`,
            localId: `manager-session-end:${child.id}`
        }])
        engine.stop()
    })

    it('resumes an inactive manager before delivering the fallback notification', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, {} as never, new RpcRegistry(), { broadcast() {} } as never)
        const manager = engine.getOrCreateSession(
            'inactive-manager',
            { path: '/tmp/manager', host: 'localhost', name: 'Manager', flavor: 'codex' },
            null,
            'default'
        )
        const child = engine.getOrCreateSession(
            'failing-child',
            { path: '/tmp/child', host: 'localhost', name: 'Worker', flavor: 'codex' },
            null,
            'default'
        )
        engine.setSessionManager(child.id, manager.id, 'default')
        let resumed = false
        engine.resumeSession = async () => {
            resumed = true
            return { type: 'success', sessionId: manager.id }
        }
        const messages: string[] = []
        engine.sendMessage = async (_sessionId, payload) => { messages.push(payload.text) }

        engine.handleSessionEnd({ sid: child.id, time: Date.now(), reason: 'error' })
        await flushAsync()

        expect(resumed).toBe(true)
        expect(messages[0]).toContain('ended (error)')
        engine.stop()
    })
})
