import axios, { type AxiosInstance } from 'axios'
import {
    authHeaders,
    exchangeJwt,
    listSessions,
    PingPeerError,
    resolveAccessToken,
    resolveApiUrl,
    resolveSessionByPrefix,
    type PingPeerSessionSummary
} from '@/modules/pingPeer/pingPeer'

type ArchivePeerOptions = {
    sessionIdPrefix: string
    callerSessionId: string
    callerProjectKey?: string | null
    apiUrl?: string
    accessToken?: string
    http?: AxiosInstance
}

export type ArchivePeerResult = {
    sessionId: string
    archived: boolean
    alreadyInState: boolean
    projectKey: string
}

function projectKey(session: PingPeerSessionSummary): string | null {
    const basePath = session.metadata?.worktree?.basePath?.trim()
    if (basePath) return basePath
    const path = session.metadata?.path?.trim()
    return path || null
}

function requestError(action: string, response: { status: number; data?: any }): PingPeerError {
    const detail = typeof response.data?.error === 'string' ? response.data.error : `HTTP ${response.status}`
    const code = response.status === 401 || response.status === 403 ? 'auth_failed'
        : response.status === 404 ? 'not_found'
            : 'send_failed'
    return new PingPeerError(code, `${action} failed: ${detail}`)
}

async function mutatePeerArchive(
    options: ArchivePeerOptions,
    archived: boolean
): Promise<ArchivePeerResult> {
    const prefix = options.sessionIdPrefix.trim()
    if (!prefix) throw new PingPeerError('bad_args', 'session id prefix is required')
    if (!options.callerSessionId.trim()) throw new PingPeerError('bad_args', 'current HAPI session id is required')

    const apiUrl = resolveApiUrl(options.apiUrl)
    const accessToken = resolveAccessToken(options.accessToken)
    const http = options.http ?? axios
    const jwt = await exchangeJwt(apiUrl, accessToken, http)
    const sessions = await listSessions(apiUrl, jwt, http)
    const caller = sessions.find((session) => session.id === options.callerSessionId)
    if (!caller) throw new PingPeerError('not_found', 'current HAPI session is unavailable in this namespace')

    const callerProjectKey = options.callerProjectKey?.trim() || projectKey(caller)
    const callerLiveProjectKey = projectKey(caller)
    if (!callerProjectKey) throw new PingPeerError('bad_args', 'current HAPI session project context is unavailable')
    if (!callerLiveProjectKey || callerLiveProjectKey !== callerProjectKey) {
        throw new PingPeerError('bad_args', 'current HAPI session project context could not be verified')
    }

    const target = resolveSessionByPrefix(sessions, prefix)
    if (target.id === caller.id) {
        throw new PingPeerError('bad_args', 'peer archive tools cannot target the current HAPI session')
    }
    const targetProjectKey = projectKey(target)
    if (!targetProjectKey || targetProjectKey !== callerProjectKey) {
        throw new PingPeerError('bad_args', 'target session belongs to a different project')
    }

    const isArchived = target.metadata?.lifecycleState === 'archived'
    if ((archived && isArchived && !target.active) || (!archived && !isArchived)) {
        return { sessionId: target.id, archived, alreadyInState: true, projectKey: targetProjectKey }
    }
    if (!archived && target.active) {
        throw new PingPeerError('send_failed', 'active session cannot be unarchived')
    }

    const action = archived ? 'archive_peer' : 'unarchive_peer'
    const endpoint = archived ? 'archive' : 'unarchive'
    const body = archived ? { allowInactive: true } : {}
    const response = await http.post(
        `${apiUrl}/api/sessions/${encodeURIComponent(target.id)}/${endpoint}`,
        body,
        { headers: authHeaders(jwt), timeout: 30_000, validateStatus: () => true }
    )
    if (response.status < 200 || response.status >= 300 || response.data?.ok !== true) {
        throw requestError(action, response)
    }

    return { sessionId: target.id, archived, alreadyInState: false, projectKey: targetProjectKey }
}

export function archivePeer(options: ArchivePeerOptions): Promise<ArchivePeerResult> {
    return mutatePeerArchive(options, true)
}

export function unarchivePeer(options: ArchivePeerOptions): Promise<ArchivePeerResult> {
    return mutatePeerArchive(options, false)
}
