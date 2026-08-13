import axios, { type AxiosInstance } from 'axios'
import { RenameSessionRequestSchema } from '@hapi/protocol/apiTypes'
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

export type RenamePeerOptions = {
    sessionIdPrefix: string
    title: string
    callerSessionId: string
    callerProjectKey?: string | null
    apiUrl?: string
    accessToken?: string
    http?: AxiosInstance
}

export type RenamePeerResult = {
    sessionId: string
    title: string
    projectKey: string
}

function projectKey(session: PingPeerSessionSummary): string | null {
    const basePath = session.metadata?.worktree?.basePath?.trim()
    if (basePath) return basePath
    const path = session.metadata?.path?.trim()
    return path || null
}

export async function renamePeer(options: RenamePeerOptions): Promise<RenamePeerResult> {
    const prefix = options.sessionIdPrefix.trim()
    if (!prefix) throw new PingPeerError('bad_args', 'session id prefix is required')
    const parsedTitle = RenameSessionRequestSchema.safeParse({ name: options.title.trim() })
    if (!parsedTitle.success) {
        throw new PingPeerError('bad_args', 'title must be 1-255 characters after trimming')
    }
    if (!options.callerSessionId.trim()) {
        throw new PingPeerError('bad_args', 'current HAPI session id is required')
    }

    const apiUrl = resolveApiUrl(options.apiUrl)
    const accessToken = resolveAccessToken(options.accessToken)
    const http = options.http ?? axios
    const jwt = await exchangeJwt(apiUrl, accessToken, http)
    const sessions = await listSessions(apiUrl, jwt, http)
    const caller = sessions.find((session) => session.id === options.callerSessionId)
    if (!caller) {
        throw new PingPeerError('not_found', 'current HAPI session is unavailable in this namespace')
    }
    const callerProjectKey = options.callerProjectKey?.trim() || projectKey(caller)
    if (!callerProjectKey) {
        throw new PingPeerError('bad_args', 'current HAPI session project context is unavailable')
    }
    const callerLiveProjectKey = projectKey(caller)
    if (!callerLiveProjectKey || callerLiveProjectKey !== callerProjectKey) {
        throw new PingPeerError('bad_args', 'current HAPI session project context could not be verified')
    }

    const target = resolveSessionByPrefix(sessions, prefix)
    const targetProjectKey = projectKey(target)
    if (!targetProjectKey || targetProjectKey !== callerProjectKey) {
        throw new PingPeerError('bad_args', 'target session belongs to a different project')
    }

    const response = await http.patch(
        `${apiUrl}/api/sessions/${encodeURIComponent(target.id)}`,
        { name: parsedTitle.data.name },
        { headers: authHeaders(jwt), timeout: 15_000, validateStatus: () => true }
    )
    if (response.status < 200 || response.status >= 300 || response.data?.ok !== true) {
        const detail = typeof response.data?.error === 'string' ? response.data.error : `HTTP ${response.status}`
        const code = response.status === 401 || response.status === 403 ? 'auth_failed'
            : response.status === 404 ? 'not_found'
                : 'send_failed'
        throw new PingPeerError(code, `rename_peer failed: ${detail}`)
    }

    return { sessionId: target.id, title: parsedTitle.data.name, projectKey: targetProjectKey }
}
