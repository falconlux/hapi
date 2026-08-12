import axios, { type AxiosInstance } from 'axios'
import type { SessionGroup, SessionGroupMembership, SessionGroupsResponse } from '@hapi/protocol/types'
import {
    CreateSessionGroupInputSchema,
    MoveSessionsToGroupInputSchema,
    RenameSessionGroupInputSchema,
    SessionGroupIdSchema,
    SessionGroupProjectKeySchema,
    SessionGroupsResponseSchema
} from '@hapi/protocol/schemas'
import {
    authHeaders,
    exchangeJwt,
    resolveApiUrl,
    resolveAccessToken,
    type PingPeerSessionSummary
} from '@/modules/pingPeer/pingPeer'

export type ProjectGroupErrorCode = 'bad_args' | 'auth_failed' | 'not_found' | 'conflict' | 'invalid_project' | 'request_failed'

export class ProjectGroupError extends Error {
    constructor(readonly code: ProjectGroupErrorCode, message: string) {
        super(message)
        this.name = 'ProjectGroupError'
    }
}

type ProjectSessionSummary = PingPeerSessionSummary & {
    metadata?: PingPeerSessionSummary['metadata'] & {
        worktree?: { basePath?: string | null } | null
    } | null
}

export type ProjectGroupSession = {
    id: string
    title: string
    path: string | null
}

export type ProjectGroupListItem = SessionGroup & {
    count: number
    sessions: ProjectGroupSession[]
}

export type ListProjectGroupsResult = {
    projectKey: string | null
    groups: ProjectGroupListItem[]
    memberships: SessionGroupMembership[]
    unassigned: ProjectGroupSession[]
}

type HubOptions = {
    apiUrl?: string
    accessToken?: string
    http?: AxiosInstance
}

export type ListProjectGroupsOptions = HubOptions & { projectKey?: string }
export type CreateProjectGroupOptions = HubOptions & { projectKey: string; name: string }
export type RenameProjectGroupOptions = HubOptions & { groupId: string; name: string }
export type DeleteProjectGroupOptions = HubOptions & { groupId: string }
export type MoveSessionsToProjectGroupOptions = HubOptions & { sessionIds: string[]; groupId: string | null }

function sessionPath(session: ProjectSessionSummary): string | null {
    const basePath = session.metadata?.worktree?.basePath
    if (typeof basePath === 'string' && basePath.trim()) return basePath
    const path = session.metadata?.path
    return typeof path === 'string' && path.trim() ? path : null
}

function sessionTitle(session: ProjectSessionSummary): string {
    const name = session.metadata?.name?.trim()
    if (name) return name
    const summary = session.metadata?.summary?.text?.trim()
    if (summary) return summary
    return session.id
}

function toProjectSession(session: ProjectSessionSummary): ProjectGroupSession {
    return { id: session.id, title: sessionTitle(session), path: sessionPath(session) }
}

function requestError(action: string, response: { status: number; data?: any }): ProjectGroupError {
    const detail = typeof response.data?.error === 'string' ? response.data.error : `HTTP ${response.status}`
    const code = response.data?.code
    if (response.status === 401 || response.status === 403) return new ProjectGroupError('auth_failed', `${action} failed: ${detail}`)
    if (response.status === 404 || code === 'not-found') return new ProjectGroupError('not_found', `${action} failed: ${detail}`)
    if (response.status === 409 || code === 'conflict') return new ProjectGroupError('conflict', `${action} failed: ${detail}`)
    if (code === 'invalid-project') return new ProjectGroupError('invalid_project', `${action} failed: ${detail}`)
    return new ProjectGroupError('request_failed', `${action} failed: ${detail}`)
}

async function withHub(options: HubOptions): Promise<{ apiUrl: string; jwt: string; http: AxiosInstance }> {
    try {
        const apiUrl = resolveApiUrl(options.apiUrl)
        const accessToken = resolveAccessToken(options.accessToken)
        const http = options.http ?? axios
        const jwt = await exchangeJwt(apiUrl, accessToken, http)
        return { apiUrl, jwt, http }
    } catch (error) {
        if (error instanceof ProjectGroupError) throw error
        throw new ProjectGroupError('auth_failed', error instanceof Error ? error.message : String(error))
    }
}

export async function listProjectGroups(options: ListProjectGroupsOptions = {}): Promise<ListProjectGroupsResult> {
    const projectKey = options.projectKey === undefined
        ? undefined
        : SessionGroupProjectKeySchema.parse(options.projectKey)
    const { apiUrl, jwt, http } = await withHub(options)
    const [groupsResponse, sessionsResponse] = await Promise.all([
        http.get(`${apiUrl}/api/session-groups`, {
            headers: authHeaders(jwt),
            ...(projectKey ? { params: { projectKey } } : {}),
            timeout: 15_000,
            validateStatus: () => true
        }),
        http.get(`${apiUrl}/api/sessions`, {
            headers: authHeaders(jwt),
            timeout: 15_000,
            validateStatus: () => true
        })
    ])
    if (groupsResponse.status < 200 || groupsResponse.status >= 300) throw requestError('list_project_groups', groupsResponse)
    if (sessionsResponse.status < 200 || sessionsResponse.status >= 300) throw requestError('list sessions', sessionsResponse)

    const parsedGroups = SessionGroupsResponseSchema.safeParse(groupsResponse.data)
    if (!parsedGroups.success) throw new ProjectGroupError('request_failed', 'list_project_groups failed: unexpected group response')
    const rawSessions = Array.isArray(sessionsResponse.data?.sessions)
        ? sessionsResponse.data.sessions as ProjectSessionSummary[]
        : Array.isArray(sessionsResponse.data)
            ? sessionsResponse.data as ProjectSessionSummary[]
            : null
    if (!rawSessions) throw new ProjectGroupError('request_failed', 'list_project_groups failed: unexpected sessions response')

    const sessions = projectKey ? rawSessions.filter((session) => sessionPath(session) === projectKey) : rawSessions
    const sessionsById = new Map(sessions.map((session) => [session.id, session]))
    const memberships = parsedGroups.data.memberships.filter((membership) => sessionsById.has(membership.sessionId))
    const membershipBySession = new Map(memberships.map((membership) => [membership.sessionId, membership]))
    const groups = parsedGroups.data.groups.map((group) => {
        const groupSessions = memberships
            .filter((membership) => membership.groupId === group.id)
            .map((membership) => sessionsById.get(membership.sessionId))
            .filter((session): session is ProjectSessionSummary => session !== undefined)
            .map(toProjectSession)
        return { ...group, count: groupSessions.length, sessions: groupSessions }
    })
    const unassigned = sessions
        .filter((session) => !membershipBySession.has(session.id))
        .map(toProjectSession)

    return { projectKey: projectKey ?? null, groups, memberships, unassigned }
}

export async function createProjectGroup(options: CreateProjectGroupOptions): Promise<SessionGroup> {
    const input = CreateSessionGroupInputSchema.parse({ projectKey: options.projectKey, name: options.name })
    const { apiUrl, jwt, http } = await withHub(options)
    const response = await http.post(`${apiUrl}/api/session-groups`, input, {
        headers: authHeaders(jwt), timeout: 15_000, validateStatus: () => true
    })
    if (response.status < 200 || response.status >= 300) throw requestError('create_project_group', response)
    return response.data.group as SessionGroup
}

export async function renameProjectGroup(options: RenameProjectGroupOptions): Promise<SessionGroup> {
    const groupId = SessionGroupIdSchema.parse(options.groupId)
    const input = RenameSessionGroupInputSchema.parse({ name: options.name })
    const { apiUrl, jwt, http } = await withHub(options)
    const response = await http.patch(`${apiUrl}/api/session-groups/${encodeURIComponent(groupId)}`, input, {
        headers: authHeaders(jwt), timeout: 15_000, validateStatus: () => true
    })
    if (response.status < 200 || response.status >= 300) throw requestError('rename_project_group', response)
    return response.data.group as SessionGroup
}

export async function deleteProjectGroup(options: DeleteProjectGroupOptions): Promise<void> {
    const groupId = SessionGroupIdSchema.parse(options.groupId)
    const { apiUrl, jwt, http } = await withHub(options)
    const response = await http.delete(`${apiUrl}/api/session-groups/${encodeURIComponent(groupId)}`, {
        headers: authHeaders(jwt), timeout: 15_000, validateStatus: () => true
    })
    if (response.status < 200 || response.status >= 300) throw requestError('delete_project_group', response)
}

export async function moveSessionsToProjectGroup(options: MoveSessionsToProjectGroupOptions): Promise<void> {
    const input = MoveSessionsToGroupInputSchema.parse({ sessionIds: options.sessionIds, groupId: options.groupId })
    const { apiUrl, jwt, http } = await withHub(options)
    const response = await http.patch(`${apiUrl}/api/session-groups/memberships`, input, {
        headers: authHeaders(jwt), timeout: 15_000, validateStatus: () => true
    })
    if (response.status < 200 || response.status >= 300) throw requestError('move_sessions_to_group', response)
}
