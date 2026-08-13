import { describe, expect, it, vi } from 'vitest'
import { archivePeer, deletePeer, restartPeer, unarchivePeer } from './archivePeer'

const callerId = 'aaaaaaaa-1111-4111-8111-111111111111'
const peerId = 'bbbbbbbb-2222-4222-8222-222222222222'
const credentials = { apiUrl: 'http://hub.test', accessToken: 'token' }

function createHttp(options: { active?: boolean; archived?: boolean; peerPath?: string; omitCaller?: boolean; duplicate?: boolean; status?: number; archiveStatus?: number; reopenStatus?: number; reopenSessionId?: string; deleteStatus?: number; activePolls?: boolean[] } = {}) {
    let pollIndex = 0
    const sessions = [
        ...(options.omitCaller ? [] : [{ id: callerId, active: true, metadata: { path: '/project/a' } }]),
        { id: peerId, active: options.active ?? false, metadata: { path: options.peerPath ?? '/project/a', ...(options.archived ? { lifecycleState: 'archived' } : {}) } },
        ...(options.duplicate ? [{ id: 'bbbbbbbb-3333-4333-8333-333333333333', active: false, metadata: { path: '/project/a' } }] : [])
    ]
    return {
        post: vi.fn(async (url: string, body?: unknown) => {
            if (url.endsWith('/api/auth')) return { status: 200, data: { token: 'jwt' } }
            const status = url.endsWith('/archive') ? options.archiveStatus ?? options.status ?? 200
                : url.endsWith('/reopen') ? options.reopenStatus ?? options.status ?? 200
                    : options.status ?? 200
            const data = status >= 400 ? { error: 'denied' }
                : url.endsWith('/reopen') ? { ok: true, sessionId: options.reopenSessionId ?? peerId, resumed: true }
                    : { ok: true }
            return { status, data, body }
        }),
        get: vi.fn(async (url: string) => {
            if (url.endsWith('/api/sessions')) return { status: 200, data: { sessions } }
            if (url.endsWith(`/api/sessions/${peerId}`)) {
                const active = options.activePolls?.[Math.min(pollIndex++, options.activePolls.length - 1)] ?? false
                return { status: 200, data: { session: { ...sessions[1], active } } }
            }
            return Promise.reject(new Error(`unexpected GET ${url}`))
        }),
        delete: vi.fn(async () => {
            const status = options.deleteStatus ?? 200
            return { status, data: status >= 400 ? { error: 'delete failed' } : { ok: true } }
        })
    }
}

describe('archivePeer / unarchivePeer', () => {
    it('archives active and inactive targets through the existing Hub archive route', async () => {
        for (const active of [true, false]) {
            const http = createHttp({ active })
            await expect(archivePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: http as never })).resolves.toMatchObject({ sessionId: peerId, archived: true, alreadyInState: false })
            expect(http.post).toHaveBeenLastCalledWith(
                `http://hub.test/api/sessions/${peerId}/archive`,
                { allowInactive: true },
                expect.any(Object)
            )
        }
    })

    it('still archives an active target with stale archived metadata', async () => {
        const http = createHttp({ active: true, archived: true })
        await expect(archivePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: http as never })).resolves.toMatchObject({ alreadyInState: false })
        expect(http.post).toHaveBeenCalledTimes(2)
    })

    it('unarchives durably without calling resume/reopen or spawning a process', async () => {
        const http = createHttp({ archived: true })
        await expect(unarchivePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: http as never })).resolves.toMatchObject({ archived: false, alreadyInState: false })
        expect(http.post).toHaveBeenLastCalledWith(
            `http://hub.test/api/sessions/${peerId}/unarchive`,
            {},
            expect.any(Object)
        )
        expect(http.post.mock.calls.some(([url]) => /resume|reopen|agent-sessions/.test(url))).toBe(false)
    })

    it('is idempotent in both directions without a write', async () => {
        const archived = createHttp({ archived: true })
        await expect(archivePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: archived as never })).resolves.toMatchObject({ alreadyInState: true })
        expect(archived.post).toHaveBeenCalledOnce()

        const open = createHttp()
        await expect(unarchivePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: open as never })).resolves.toMatchObject({ alreadyInState: true })
        expect(open.post).toHaveBeenCalledOnce()
    })

    it('fails closed for missing caller, ambiguous prefix, forged context, and cross-project target', async () => {
        await expect(archivePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: createHttp({ omitCaller: true }) as never })).rejects.toMatchObject({ code: 'not_found' })
        await expect(archivePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: createHttp({ duplicate: true }) as never })).rejects.toMatchObject({ code: 'ambiguous' })
        await expect(archivePeer({ ...credentials, callerSessionId: callerId, callerProjectKey: '/project/b', sessionIdPrefix: 'bbbb', http: createHttp() as never })).rejects.toThrow(/could not be verified/)
        await expect(archivePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: createHttp({ peerPath: '/project/b' }) as never })).rejects.toThrow(/different project/)
    })

    it('does not unarchive an active target and maps Hub authorization failure', async () => {
        await expect(unarchivePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: createHttp({ active: true, archived: true }) as never })).rejects.toThrow(/active session/)
        await expect(archivePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: createHttp({ status: 403 }) as never })).rejects.toMatchObject({ code: 'auth_failed' })
    })
})

describe('restartPeer', () => {
    it('reopens inactive and archived targets directly with the same HAPI session id', async () => {
        for (const archived of [false, true]) {
            const http = createHttp({ archived })
            await expect(restartPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: http as never })).resolves.toEqual({ sessionId: peerId, restarted: true, projectKey: '/project/a' })
            expect(http.post).toHaveBeenLastCalledWith(`http://hub.test/api/sessions/${peerId}/reopen`, {}, expect.any(Object))
        }
    })

    it('safely stops an active peer, waits for inactive, then reopens it', async () => {
        const http = createHttp({ active: true, activePolls: [true, false] })
        const sleep = vi.fn(async () => {})
        await restartPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: http as never, sleep })
        expect(http.post).toHaveBeenNthCalledWith(2, `http://hub.test/api/sessions/${peerId}/archive`, { allowInactive: true }, expect.any(Object))
        expect(http.post).toHaveBeenNthCalledWith(3, `http://hub.test/api/sessions/${peerId}/reopen`, {}, expect.any(Object))
        expect(sleep).toHaveBeenCalledOnce()
    })

    it('fails closed for missing, ambiguous, cross-project, forged, and current-session targets', async () => {
        await expect(restartPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'missing', http: createHttp() as never })).rejects.toMatchObject({ code: 'not_found' })
        await expect(restartPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: createHttp({ duplicate: true }) as never })).rejects.toMatchObject({ code: 'ambiguous' })
        await expect(restartPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: createHttp({ peerPath: '/project/b' }) as never })).rejects.toThrow(/different project/)
        await expect(restartPeer({ ...credentials, callerSessionId: callerId, callerProjectKey: '/project/b', sessionIdPrefix: 'bbbb', http: createHttp() as never })).rejects.toThrow(/could not be verified/)
        await expect(restartPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: callerId, http: createHttp() as never })).rejects.toThrow(/current HAPI session/)
    })

    it('does not reopen after safe-stop failure and maps reopen failure', async () => {
        const stopFailed = createHttp({ active: true, archiveStatus: 500 })
        await expect(restartPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: stopFailed as never })).rejects.toThrow(/safe stop/)
        expect(stopFailed.post.mock.calls.some(([url]) => url.endsWith('/reopen'))).toBe(false)

        await expect(restartPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: createHttp({ reopenStatus: 503 }) as never })).rejects.toThrow(/reopen/)
    })

    it('rejects a reopen result that changes the HAPI session id', async () => {
        await expect(restartPeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', http: createHttp({ reopenSessionId: 'new-id' }) as never })).rejects.toThrow(/preserve/)
    })
})

describe('deletePeer', () => {
    it('requires explicit confirm=true before authentication', async () => {
        const http = createHttp()
        await expect(deletePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', confirm: false, http: http as never })).rejects.toMatchObject({ code: 'bad_args' })
        expect(http.post).not.toHaveBeenCalled()
    })

    it('permanently deletes an inactive peer through the existing sidebar endpoint', async () => {
        const http = createHttp()
        await expect(deletePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', confirm: true, http: http as never })).resolves.toEqual({ sessionId: peerId, deleted: true, projectKey: '/project/a' })
        expect(http.delete).toHaveBeenCalledWith(`http://hub.test/api/sessions/${peerId}`, expect.any(Object))
        expect(http.post).toHaveBeenCalledOnce()
    })

    it('safely archives an active target before deleting it', async () => {
        const http = createHttp({ active: true })
        await deletePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', confirm: true, http: http as never })
        expect(http.post).toHaveBeenNthCalledWith(2, `http://hub.test/api/sessions/${peerId}/archive`, { allowInactive: true }, expect.any(Object))
        expect(http.post.mock.invocationCallOrder[1]).toBeLessThan(http.delete.mock.invocationCallOrder[0]!)
    })

    it('does not delete when the active-session safe stop fails', async () => {
        const http = createHttp({ active: true, archiveStatus: 500 })
        await expect(deletePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', confirm: true, http: http as never })).rejects.toThrow(/safe stop/)
        expect(http.delete).not.toHaveBeenCalled()
    })

    it('fails closed for missing, ambiguous, cross-project, forged, and current-session targets', async () => {
        const missing = createHttp()
        await expect(deletePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'missing', confirm: true, http: missing as never })).rejects.toMatchObject({ code: 'not_found' })
        await expect(deletePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', confirm: true, http: createHttp({ duplicate: true }) as never })).rejects.toMatchObject({ code: 'ambiguous' })
        await expect(deletePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: 'bbbb', confirm: true, http: createHttp({ peerPath: '/project/b' }) as never })).rejects.toThrow(/different project/)
        await expect(deletePeer({ ...credentials, callerSessionId: callerId, callerProjectKey: '/project/b', sessionIdPrefix: 'bbbb', confirm: true, http: createHttp() as never })).rejects.toThrow(/could not be verified/)
        await expect(deletePeer({ ...credentials, callerSessionId: callerId, sessionIdPrefix: callerId, confirm: true, http: createHttp() as never })).rejects.toThrow(/current HAPI session/)
    })
})
