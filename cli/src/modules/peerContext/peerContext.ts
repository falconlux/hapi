import axios, { type AxiosInstance } from 'axios'
import {
    authHeaders, exchangeJwt, listSessions, PingPeerError, resolveAccessToken,
    resolveApiUrl, resolveSessionByPrefix, type PingPeerSessionSummary
} from '@/modules/pingPeer/pingPeer'

type PeerContextOptions = {
    sessionIdPrefix: string
    callerSessionId: string
    callerProjectKey?: string | null
    confirm?: boolean
    apiUrl?: string
    accessToken?: string
    http?: AxiosInstance
}

function projectKey(session: PingPeerSessionSummary): string | null {
    return session.metadata?.worktree?.basePath?.trim() || session.metadata?.path?.trim() || null
}

async function mutatePeerContext(options: PeerContextOptions, operation: 'compact' | 'reset') {
    if (operation === 'reset' && options.confirm !== true) {
        throw new PingPeerError('bad_args', 'confirm=true is required for peer context reset')
    }
    const prefix = options.sessionIdPrefix.trim()
    if (!prefix || !options.callerSessionId.trim()) throw new PingPeerError('bad_args', 'session id prefix and current HAPI session id are required')
    const apiUrl = resolveApiUrl(options.apiUrl)
    const http = options.http ?? axios
    const jwt = await exchangeJwt(apiUrl, resolveAccessToken(options.accessToken), http)
    const sessions = await listSessions(apiUrl, jwt, http)
    const caller = sessions.find((session) => session.id === options.callerSessionId)
    if (!caller) throw new PingPeerError('not_found', 'current HAPI session is unavailable in this namespace')
    const expectedProjectKey = options.callerProjectKey?.trim() || projectKey(caller)
    if (!expectedProjectKey || projectKey(caller) !== expectedProjectKey) {
        throw new PingPeerError('bad_args', 'current HAPI session project context could not be verified')
    }
    const target = resolveSessionByPrefix(sessions, prefix)
    if (target.id === caller.id) throw new PingPeerError('bad_args', `${operation}_peer cannot target the current HAPI session`)
    if (projectKey(target) !== expectedProjectKey) throw new PingPeerError('bad_args', 'target session belongs to a different project')
    if (!target.active) throw new PingPeerError('send_failed', `${operation}_peer requires an active target session`)

    const response = await http.post(`${apiUrl}/api/sessions/${encodeURIComponent(target.id)}/${operation}`, {}, {
        headers: authHeaders(jwt), timeout: operation === 'compact' ? 10 * 60_000 : 60_000, validateStatus: () => true
    })
    if (response.status < 200 || response.status >= 300 || response.data?.ok !== true) {
        const detail = typeof response.data?.error === 'string' ? response.data.error : `HTTP ${response.status}`
        throw new PingPeerError('send_failed', `${operation}_peer failed: ${detail}`)
    }
    return { sessionId: target.id, operation, projectKey: expectedProjectKey }
}

export const compactPeer = (options: PeerContextOptions) => mutatePeerContext(options, 'compact')
export const resetPeer = (options: PeerContextOptions & { confirm: boolean }) => mutatePeerContext(options, 'reset')
