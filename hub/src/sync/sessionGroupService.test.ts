import { describe, expect, it, mock } from 'bun:test'
import { Store } from '../store'
import type { EventPublisher } from './eventPublisher'
import { SessionGroupError, SessionGroupService } from './sessionGroupService'

function createHarness() {
    const store = new Store(':memory:')
    const emit = mock(() => {})
    const service = new SessionGroupService(
        store.sessionGroups,
        { emit } as unknown as EventPublisher
    )
    return { store, service, emit }
}

function createSession(
    store: Store,
    tag: string,
    namespace: string,
    path: string,
    worktreeBasePath?: string
) {
    return store.sessions.getOrCreateSession(
        tag,
        {
            path,
            host: 'test',
            ...(worktreeBasePath
                ? { worktree: { basePath: worktreeBasePath, branch: 'feature', name: 'wt' } }
                : {})
        },
        null,
        namespace
    )
}

describe('SessionGroupService', () => {
    it('persists project display names without changing project keys and isolates namespaces', () => {
        const { store, service } = createHarness()
        createSession(store, 'alpha-project', 'alpha', '/project/a')
        createSession(store, 'beta-project', 'beta', '/project/a')
        expect(service.renameProject('alpha', '/project/a', 'Alpha')).toMatchObject({ projectKey: '/project/a', name: 'Alpha' })
        expect(service.list('alpha').projects).toEqual([expect.objectContaining({ projectKey: '/project/a', name: 'Alpha' })])
        expect(service.list('beta').projects).toEqual([])
        store.close()
    })

    it('isolates groups and memberships by namespace and projectKey', () => {
        const { store, service } = createHarness()
        const alpha = createSession(store, 'alpha-a', 'alpha', '/worktree/a', '/project/a')
        const alphaOther = createSession(store, 'alpha-b', 'alpha', '/project/b')
        const beta = createSession(store, 'beta-a', 'beta', '/project/a')

        const alphaGroup = service.create('alpha', '/project/a', 'Review')
        const betaGroup = service.create('beta', '/project/a', 'Review')
        service.moveSessions('alpha', [alpha.id], alphaGroup.id)
        service.moveSessions('beta', [beta.id], betaGroup.id)

        expect(service.list('alpha')).toEqual({
            groups: [alphaGroup],
            memberships: [expect.objectContaining({ sessionId: alpha.id, groupId: alphaGroup.id, projectKey: '/project/a' })],
            projects: []
        })
        expect(service.list('alpha', '/project/b')).toEqual({ groups: [], memberships: [], projects: [] })
        expect(() => service.moveSessions('alpha', [alphaOther.id], alphaGroup.id)).toThrow(SessionGroupError)
        expect(() => service.moveSessions('alpha', [beta.id], alphaGroup.id)).toThrow(SessionGroupError)
        store.close()
    })

    it('deletes only the group and memberships, never sessions', () => {
        const { store, service } = createHarness()
        const session = createSession(store, 'delete-safe', 'alpha', '/project/a')
        const group = service.create('alpha', '/project/a', 'Temporary')
        service.moveSessions('alpha', [session.id], group.id)

        service.delete('alpha', group.id)

        expect(store.sessions.getSessionByNamespace(session.id, 'alpha')?.id).toBe(session.id)
        expect(service.list('alpha')).toEqual({ groups: [], memberships: [], projects: [] })
        store.close()
    })

    it('rolls back an entire batch when any session has the wrong project', () => {
        const { store, service } = createHarness()
        const first = createSession(store, 'batch-a', 'alpha', '/project/a')
        const second = createSession(store, 'batch-b', 'alpha', '/project/b')
        const original = service.create('alpha', '/project/a', 'Original')
        const target = service.create('alpha', '/project/a', 'Target')
        service.moveSessions('alpha', [first.id], original.id)

        expect(() => service.moveSessions('alpha', [first.id, second.id], target.id)).toThrow(
            'Session and group belong to different projects'
        )

        expect(service.list('alpha').memberships).toEqual([
            expect.objectContaining({ sessionId: first.id, groupId: original.id })
        ])
        store.close()
    })

    it('keeps one membership per session and supports moving to ungrouped', () => {
        const { store, service, emit } = createHarness()
        const session = createSession(store, 'move-one', 'alpha', '/project/a')
        const first = service.create('alpha', '/project/a', 'First')
        const second = service.create('alpha', '/project/a', 'Second')

        service.moveSessions('alpha', [session.id], first.id)
        service.moveSessions('alpha', [session.id], second.id)
        expect(service.list('alpha').memberships).toEqual([
            expect.objectContaining({ sessionId: session.id, groupId: second.id })
        ])

        service.moveSessions('alpha', [session.id], null)
        expect(service.list('alpha').memberships).toEqual([])
        expect(emit).toHaveBeenCalledWith({ type: 'session-groups-updated', namespace: 'alpha' })
        store.close()
    })

    it('enforces case-insensitive unique names within a project only', () => {
        const { store, service } = createHarness()
        createSession(store, 'unique-a', 'alpha', '/project/a')
        createSession(store, 'unique-b', 'alpha', '/project/b')
        service.create('alpha', '/project/a', 'Review')

        expect(() => service.create('alpha', '/project/a', 'review')).toThrow(
            'A group with this name already exists'
        )
        expect(service.create('alpha', '/project/b', 'Review').projectKey).toBe('/project/b')
        store.close()
    })
})
