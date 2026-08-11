import { describe, expect, it } from 'vitest'
import type { SessionGroup, SessionGroupMembership, SessionSummary } from '@/types/api'
import { buildSecondarySessionGroups, getSessionProjectKey } from './session-groups'

function makeSession(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
    return {
        id,
        active: false,
        thinking: false,
        activeAt: 0,
        updatedAt: 0,
        metadata: { path: '/project/a' },
        metadataVersion: 0,
        agentStateVersion: 0,
        todosUpdatedAt: 0,
        todoProgress: null,
        pendingRequestsCount: 0,
        pendingRequestKinds: [],
        pendingRequests: [],
        backgroundTaskCount: 0,
        futureScheduledMessageCount: 0,
        nextScheduledAt: null,
        model: null,
        effort: null,
        ...overrides
    } as SessionSummary
}

const groups: SessionGroup[] = [
    { id: '11111111-1111-4111-8111-111111111111', projectKey: '/project/a', name: 'Review', createdAt: 1, updatedAt: 1 },
    { id: '22222222-2222-4222-8222-222222222222', projectKey: '/project/a', name: 'Later', createdAt: 2, updatedAt: 2 },
    { id: '33333333-3333-4333-8333-333333333333', projectKey: '/project/b', name: 'Foreign', createdAt: 1, updatedAt: 1 }
]

describe('session secondary groups', () => {
    it('uses worktree basePath as the project scope', () => {
        expect(getSessionProjectKey(makeSession('worktree', {
            metadata: {
                path: '/worktrees/a',
                worktree: { basePath: '/project/a', branch: 'feature', name: 'a' }
            }
        }))).toBe('/project/a')
    })

    it('partitions memberships without leaking another project and keeps empty groups', () => {
        const sessions = [makeSession('one'), makeSession('two'), makeSession('three')]
        const memberships: SessionGroupMembership[] = [
            { sessionId: 'one', groupId: groups[0]!.id, projectKey: '/project/a', updatedAt: 10 },
            { sessionId: 'two', groupId: groups[2]!.id, projectKey: '/project/b', updatedAt: 10 }
        ]

        const result = buildSecondarySessionGroups('/project/a', sessions, groups, memberships, 'Ungrouped')

        expect(result.map((group) => [group.name, group.sessions.map((session) => session.id)])).toEqual([
            ['Ungrouped', ['two', 'three']],
            ['Review', ['one']],
            ['Later', []]
        ])
        expect(result.some((group) => group.name === 'Foreign')).toBe(false)
    })

    it('summarizes count, thinking, and pending for custom and ungrouped buckets', () => {
        const sessions = [
            makeSession('thinking', { active: true, thinking: true, updatedAt: 30 }),
            makeSession('pending', { active: true, pendingRequestsCount: 2, updatedAt: 20 }),
            makeSession('ungrouped', { pendingRequestsCount: 1, updatedAt: 10 })
        ]
        const memberships: SessionGroupMembership[] = [
            { sessionId: 'thinking', groupId: groups[0]!.id, projectKey: '/project/a', updatedAt: 1 },
            { sessionId: 'pending', groupId: groups[0]!.id, projectKey: '/project/a', updatedAt: 1 }
        ]

        const result = buildSecondarySessionGroups('/project/a', sessions, groups, memberships, 'Ungrouped')
        const ungrouped = result.find((group) => group.id === null)
        const review = result.find((group) => group.id === groups[0]!.id)

        expect(ungrouped).toMatchObject({ count: 1, thinkingCount: 0, pendingCount: 1 })
        expect(review).toMatchObject({ count: 2, thinkingCount: 1, pendingCount: 2, latestUpdatedAt: 30 })
    })
})
