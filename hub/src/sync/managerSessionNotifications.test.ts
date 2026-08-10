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

function createHarness(childCount: number = 1) {
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
    engine.handleSessionAlive({ sid: manager.id, time: Date.now() })
    const children = Array.from({ length: childCount }, (_, index) => {
        const child = engine.getOrCreateSession(
            `child-tag-${index}`,
            { path: `/tmp/child-${index}`, host: 'localhost', name: `Worker ${index}`, flavor: 'codex' },
            null,
            'default'
        )
        engine.setSessionManager(child.id, manager.id, 'default')
        return child
    })
    return { store, engine, manager, children }
}

describe('manager-linked agent sessions', () => {
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
        engine.stop()
    })

    it('claims concurrent duplicate end events before either can deliver', async () => {
        const { engine, children: [child] } = createHarness()
        let releaseSend!: () => void
        const blocked = new Promise<void>((resolve) => { releaseSend = resolve })
        let sends = 0
        engine.sendMessage = async () => {
            sends += 1
            await blocked
        }

        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'completed' })
        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'completed' })
        await waitFor(() => sends === 1)
        expect(sends).toBe(1)
        releaseSend()
        await waitFor(() => engine.getSession(child!.id)?.metadata?.managerNotificationState?.terminal?.status === 'sent')
        expect(sends).toBe(1)
        engine.stop()
    })

    it('releases a failed claim so a repeated end event retries once', async () => {
        const { engine, children: [child] } = createHarness()
        let attempts = 0
        engine.sendMessage = async () => {
            attempts += 1
            if (attempts === 1) throw new Error('simulated send failure')
        }

        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'error' })
        await waitFor(() => engine.getSession(child!.id)?.metadata?.managerNotificationState?.terminal?.status === 'pending')
        engine.handleSessionEnd({ sid: child!.id, time: Date.now(), reason: 'error' })
        await waitFor(() => engine.getSession(child!.id)?.metadata?.managerNotificationState?.terminal?.status === 'sent')

        expect(attempts).toBe(2)
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
