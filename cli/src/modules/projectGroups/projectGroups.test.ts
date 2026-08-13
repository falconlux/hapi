import { describe, expect, it, vi } from 'vitest'
import {
    createProjectGroup,
    deleteProjectGroup,
    listProjectGroups,
    moveSessionsToProjectGroup,
    ProjectGroupError,
    renameProjectGroup
} from './projectGroups'

type MockResponse = { status: number; data: unknown }

function createHttpMock(handlers: {
    get?: (url: string, config?: { params?: Record<string, unknown> }) => MockResponse
    post?: (url: string, body?: unknown) => MockResponse
    patch?: (url: string, body?: unknown) => MockResponse
    delete?: (url: string) => MockResponse
}) {
    return {
        get: vi.fn(async (url: string, config?: { params?: Record<string, unknown> }) => handlers.get?.(url, config) ?? fail(`GET ${url}`)),
        post: vi.fn(async (url: string, body?: unknown) => handlers.post?.(url, body) ?? fail(`POST ${url}`)),
        patch: vi.fn(async (url: string, body?: unknown) => handlers.patch?.(url, body) ?? fail(`PATCH ${url}`)),
        delete: vi.fn(async (url: string) => handlers.delete?.(url) ?? fail(`DELETE ${url}`))
    }
}

function fail(message: string): never {
    throw new Error(`unexpected ${message}`)
}

const group = {
    id: '11111111-1111-4111-8111-111111111111',
    projectKey: '/project/a',
    name: 'Review',
    createdAt: 1,
    updatedAt: 1
}

function authResponse(url: string): MockResponse | null {
    return url.endsWith('/api/auth') ? { status: 200, data: { token: 'jwt' } } : null
}

const credentials = { apiUrl: 'http://hub.test', accessToken: 'cli-token' }

describe('project group REST client', () => {
    it('lists groups, memberships, counts, session identity, and unassigned sessions in one project', async () => {
        const http = createHttpMock({
            post: (url) => authResponse(url) ?? fail(url),
            get: (url, config) => {
                if (url.endsWith('/api/session-groups')) {
                    expect(config?.params).toEqual({ projectKey: '/project/a' })
                    return {
                        status: 200,
                        data: {
                            groups: [group],
                            memberships: [{ sessionId: 'a-1', groupId: group.id, projectKey: '/project/a', updatedAt: 1 }]
                        }
                    }
                }
                if (url.endsWith('/api/sessions')) {
                    return {
                        status: 200,
                        data: { sessions: [
                            { id: 'a-1', active: false, metadata: { name: 'Review worker', path: '/project/a', lifecycleState: 'archived' } },
                            { id: 'a-2', active: true, metadata: { summary: { text: 'Coordinator' }, worktree: { basePath: '/project/a' }, path: '/tmp/wt' } },
                            { id: 'b-1', active: true, metadata: { name: 'Other', path: '/project/b' } }
                        ] }
                    }
                }
                return fail(url)
            }
        })

        await expect(listProjectGroups({
            ...credentials,
            projectKey: '/project/a',
            http: http as never
        })).resolves.toEqual({
            projectKey: '/project/a',
            groups: [{ ...group, count: 1, sessions: [{ id: 'a-1', title: 'Review worker', path: '/project/a', archived: true }] }],
            memberships: [{ sessionId: 'a-1', groupId: group.id, projectKey: '/project/a', updatedAt: 1 }],
            unassigned: [{ id: 'a-2', title: 'Coordinator', path: '/project/a', archived: false }]
        })
    })

    it('creates, renames, deletes, moves batches, and removes sessions from groups', async () => {
        const writes: Array<[string, unknown]> = []
        const http = createHttpMock({
            post: (url, body) => {
                const auth = authResponse(url)
                if (auth) return auth
                writes.push([url, body])
                return { status: 201, data: { group } }
            },
            patch: (url, body) => {
                writes.push([url, body])
                return url.endsWith('/memberships')
                    ? { status: 200, data: { ok: true } }
                    : { status: 200, data: { group: { ...group, name: 'QA' } } }
            },
            delete: (url) => {
                writes.push([url, undefined])
                return { status: 200, data: { ok: true } }
            }
        })

        await expect(createProjectGroup({ ...credentials, projectKey: '/project/a', name: 'Review', http: http as never })).resolves.toEqual(group)
        await expect(renameProjectGroup({ ...credentials, groupId: group.id, name: 'QA', http: http as never })).resolves.toEqual({ ...group, name: 'QA' })
        await expect(moveSessionsToProjectGroup({ ...credentials, sessionIds: ['s1', 's2'], groupId: group.id, http: http as never })).resolves.toBeUndefined()
        await expect(moveSessionsToProjectGroup({ ...credentials, sessionIds: ['s1', 's2'], groupId: null, http: http as never })).resolves.toBeUndefined()
        await expect(deleteProjectGroup({ ...credentials, groupId: group.id, http: http as never })).resolves.toBeUndefined()

        expect(writes).toContainEqual(['http://hub.test/api/session-groups', { projectKey: '/project/a', name: 'Review' }])
        expect(writes).toContainEqual([`http://hub.test/api/session-groups/${group.id}`, { name: 'QA' }])
        expect(writes).toContainEqual(['http://hub.test/api/session-groups/memberships', { sessionIds: ['s1', 's2'], groupId: group.id }])
        expect(writes).toContainEqual(['http://hub.test/api/session-groups/memberships', { sessionIds: ['s1', 's2'], groupId: null }])
        expect(writes).toContainEqual([`http://hub.test/api/session-groups/${group.id}`, undefined])
    })

    it('surfaces existing Hub namespace/project validation errors without bypassing them', async () => {
        const http = createHttpMock({
            post: (url) => authResponse(url) ?? fail(url),
            patch: () => ({ status: 400, data: { code: 'invalid-project', error: 'Sessions must belong to the same project as the group' } })
        })

        await expect(moveSessionsToProjectGroup({
            ...credentials,
            sessionIds: ['cross-project-session'],
            groupId: group.id,
            http: http as never
        })).rejects.toMatchObject({ code: 'invalid_project' } satisfies Partial<ProjectGroupError>)
    })

    it('validates arguments before sending writes and maps not-found responses', async () => {
        const http = createHttpMock({
            post: (url) => authResponse(url) ?? fail(url),
            delete: () => ({ status: 404, data: { code: 'not-found', error: 'Group not found' } })
        })

        await expect(moveSessionsToProjectGroup({
            ...credentials,
            sessionIds: [],
            groupId: null,
            http: http as never
        })).rejects.toThrow()
        await expect(deleteProjectGroup({
            ...credentials,
            groupId: group.id,
            http: http as never
        })).rejects.toMatchObject({ code: 'not_found' } satisfies Partial<ProjectGroupError>)
    })
})
