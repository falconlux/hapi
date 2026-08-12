import type { SessionGroup, SessionGroupMembership, SessionSummary } from '@/types/api'

export type SecondarySessionGroup = {
    id: string
    name: string
    sessions: SessionSummary[]
    count: number
    thinkingCount: number
    pendingCount: number
    hasActiveSession: boolean
    hasPinnedSession: boolean
    latestUpdatedAt: number
}

export function getSessionProjectKey(session: SessionSummary): string {
    return session.metadata?.worktree?.basePath ?? session.metadata?.path ?? 'Other'
}

export function buildSecondarySessionGroups(
    projectKey: string,
    sessions: SessionSummary[],
    groups: SessionGroup[],
    memberships: SessionGroupMembership[]
): SecondarySessionGroup[] {
    const projectGroups = groups
        .filter((group) => group.projectKey === projectKey)
        .sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name))
    const projectGroupIds = new Set(projectGroups.map((group) => group.id))
    const membershipBySession = new Map(
        memberships
            .filter((membership) => (
                membership.projectKey === projectKey
                && projectGroupIds.has(membership.groupId)
            ))
            .map((membership) => [membership.sessionId, membership.groupId])
    )
    const sessionsByGroup = new Map<string, SessionSummary[]>()
    for (const session of sessions) {
        const groupId = membershipBySession.get(session.id)
        if (!groupId) continue
        const bucket = sessionsByGroup.get(groupId) ?? []
        bucket.push(session)
        sessionsByGroup.set(groupId, bucket)
    }

    const summarize = (id: string, name: string, groupedSessions: SessionSummary[]): SecondarySessionGroup => ({
        id,
        name,
        sessions: groupedSessions,
        count: groupedSessions.length,
        thinkingCount: groupedSessions.filter((session) => session.active && session.thinking).length,
        pendingCount: groupedSessions.reduce(
            (total, session) => total + (session.pendingRequestsCount ?? 0),
            0
        ),
        hasActiveSession: groupedSessions.some((session) => session.active),
        hasPinnedSession: groupedSessions.some((session) => session.pinned),
        latestUpdatedAt: groupedSessions.reduce(
            (latest, session) => Math.max(latest, session.updatedAt),
            0
        )
    })

    return projectGroups.map((group) => summarize(
        group.id,
        group.name,
        sessionsByGroup.get(group.id) ?? []
    ))
}

export function getUngroupedSessions(
    projectKey: string,
    sessions: SessionSummary[],
    groups: SessionGroup[],
    memberships: SessionGroupMembership[]
): SessionSummary[] {
    const projectGroupIds = new Set(
        groups
            .filter((group) => group.projectKey === projectKey)
            .map((group) => group.id)
    )
    const groupedSessionIds = new Set(
        memberships
            .filter((membership) => (
                membership.projectKey === projectKey
                && projectGroupIds.has(membership.groupId)
            ))
            .map((membership) => membership.sessionId)
    )

    return sessions.filter((session) => !groupedSessionIds.has(session.id))
}
