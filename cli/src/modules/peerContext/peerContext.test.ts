import { describe, expect, it, vi } from 'vitest'
import { compactPeer, resetPeer } from './peerContext'

const callerId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const peerId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const credentials = { apiUrl: 'https://hub.test', accessToken: 'token' }

function http(options: { duplicate?: boolean; peerPath?: string; active?: boolean; flavor?: string } = {}) {
    const caller = { id: callerId, active: true, metadata: { path: '/project/a', flavor: 'codex' } }
    const peer = { id: peerId, active: options.active ?? true, metadata: { path: options.peerPath ?? '/project/a', flavor: options.flavor ?? 'codex' } }
    return {
        post: vi.fn(async (url: string) => url.endsWith('/api/auth')
            ? { status: 200, data: { token: 'jwt' } }
            : { status: 200, data: { ok: true } }),
        get: vi.fn(async () => ({ status: 200, data: { sessions: [caller, peer, ...(options.duplicate ? [{ ...peer, id: `${peerId.slice(0, -1)}c` }] : [])] } }))
    }
}

describe('peer context management', () => {
    it('compacts a unique active peer in the verified project', async () => {
        const client = http()
        await expect(compactPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: client as never }))
            .resolves.toEqual({ sessionId: peerId, operation: 'compact', projectKey: '/project/a' })
        expect(client.post).toHaveBeenLastCalledWith(expect.stringEndingWith(`/${peerId}/compact`), {}, expect.any(Object))
    })

    it('requires reset confirmation and rejects self, ambiguous, cross-project, and inactive targets', async () => {
        await expect(resetPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', confirm: false, http: http() as never })).rejects.toMatchObject({ code: 'bad_args' })
        await expect(resetPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: callerId, confirm: true, http: http() as never })).rejects.toThrow(/current HAPI session/)
        await expect(compactPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: http({ duplicate: true }) as never })).rejects.toMatchObject({ code: 'ambiguous' })
        await expect(compactPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: http({ peerPath: '/project/b' }) as never })).rejects.toThrow(/different project/)
        await expect(compactPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: http({ active: false }) as never })).rejects.toThrow(/active target/)
    })
})
