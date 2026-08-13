import { describe, expect, it, vi } from 'vitest'
import { renamePeer } from './renamePeer'

const managerId = 'aaaaaaaa-1111-4111-8111-111111111111'
const peerId = 'bbbbbbbb-2222-4222-8222-222222222222'

function createHttp(options?: { peerPath?: string; omitManager?: boolean; duplicate?: boolean; patchStatus?: number }) {
    let peerName = 'Old peer'
    const sessions = () => [
        ...(options?.omitManager ? [] : [{ id: managerId, active: true, metadata: { name: 'Manager', path: '/project/a' } }]),
        { id: peerId, active: true, metadata: { name: peerName, path: options?.peerPath ?? '/project/a' } },
        ...(options?.duplicate ? [{ id: 'bbbbbbbb-3333-4333-8333-333333333333', active: true, metadata: { path: '/project/a' } }] : [])
    ]
    return {
        post: vi.fn(async (url: string) => url.endsWith('/api/auth')
            ? { status: 200, data: { token: 'jwt' } }
            : Promise.reject(new Error(`unexpected POST ${url}`))),
        get: vi.fn(async (url: string) => url.endsWith('/api/sessions')
            ? { status: 200, data: { sessions: sessions() } }
            : Promise.reject(new Error(`unexpected GET ${url}`))),
        patch: vi.fn(async (_url: string, body: { name: string }) => {
            if (options?.patchStatus) return { status: options.patchStatus, data: { error: 'denied' } }
            peerName = body.name
            return { status: 200, data: { ok: true } }
        }),
        peerName: () => peerName
    }
}

const credentials = { apiUrl: 'http://hub.test', accessToken: 'token' }

describe('renamePeer', () => {
    it('uses the Web rename endpoint and persists the trimmed metadata.name', async () => {
        const http = createHttp()
        await expect(renamePeer({
            ...credentials,
            callerSessionId: managerId,
            callerProjectKey: '/project/a',
            sessionIdPrefix: 'bbbb',
            title: '  New peer  ',
            http: http as never
        })).resolves.toEqual({ sessionId: peerId, title: 'New peer', projectKey: '/project/a' })
        expect(http.patch).toHaveBeenCalledWith(
            `http://hub.test/api/sessions/${peerId}`,
            { name: 'New peer' },
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer jwt' }) })
        )
        expect(http.peerName()).toBe('New peer')
    })

    it('rejects missing and ambiguous target prefixes', async () => {
        const http = createHttp({ duplicate: true })
        await expect(renamePeer({ ...credentials, callerSessionId: managerId, sessionIdPrefix: 'missing', title: 'X', http: http as never })).rejects.toMatchObject({ code: 'not_found' })
        await expect(renamePeer({ ...credentials, callerSessionId: managerId, sessionIdPrefix: 'bbbb', title: 'X', http: http as never })).rejects.toMatchObject({ code: 'ambiguous' })
        expect(http.patch).not.toHaveBeenCalled()
    })

    it.each(['', ' '.repeat(3), 'x'.repeat(256)])('rejects invalid title %j before auth', async (title) => {
        const http = createHttp()
        await expect(renamePeer({ ...credentials, callerSessionId: managerId, sessionIdPrefix: 'bbbb', title, http: http as never })).rejects.toMatchObject({ code: 'bad_args' })
        expect(http.post).not.toHaveBeenCalled()
    })

    it('fails closed when caller namespace identity is unavailable', async () => {
        const http = createHttp({ omitManager: true })
        await expect(renamePeer({ ...credentials, callerSessionId: managerId, sessionIdPrefix: 'bbbb', title: 'X', http: http as never })).rejects.toMatchObject({ code: 'not_found' })
        expect(http.patch).not.toHaveBeenCalled()
    })

    it('fails closed for unverifiable or cross-project targets', async () => {
        const crossProject = createHttp({ peerPath: '/project/b' })
        await expect(renamePeer({ ...credentials, callerSessionId: managerId, sessionIdPrefix: 'bbbb', title: 'X', http: crossProject as never })).rejects.toThrow(/different project/)
        const forgedContext = createHttp()
        await expect(renamePeer({ ...credentials, callerSessionId: managerId, callerProjectKey: '/project/b', sessionIdPrefix: 'bbbb', title: 'X', http: forgedContext as never })).rejects.toThrow(/could not be verified/)
    })

    it('maps Hub authorization failures without attempting another write path', async () => {
        const http = createHttp({ patchStatus: 403 })
        await expect(renamePeer({ ...credentials, callerSessionId: managerId, sessionIdPrefix: 'bbbb', title: 'X', http: http as never })).rejects.toMatchObject({ code: 'auth_failed' })
        expect(http.patch).toHaveBeenCalledOnce()
    })
})
