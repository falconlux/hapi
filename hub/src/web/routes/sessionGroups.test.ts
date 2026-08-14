import { describe, expect, it } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createSessionGroupsRoutes } from './sessionGroups'

function createApp(engine: Partial<SyncEngine>, namespace = 'alpha') {
    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('namespace', namespace)
        await next()
    })
    app.route('/api', createSessionGroupsRoutes(() => engine as SyncEngine))
    return app
}

describe('session group routes', () => {
    it('forwards namespace-scoped CRUD and batch move requests', async () => {
        const groupId = randomUUID()
        const calls: Array<{ name: string; args: unknown[] }> = []
        const group = {
            id: groupId,
            projectKey: '/project/a',
            name: 'Review',
            createdAt: 1,
            updatedAt: 1
        }
        const engine: Partial<SyncEngine> = {
            getSessionGroups: (...args: unknown[]) => {
                calls.push({ name: 'list', args })
                return { groups: [group], memberships: [], projects: [] }
            },
            createSessionGroup: (...args: unknown[]) => {
                calls.push({ name: 'create', args })
                return group
            },
            renameSessionGroup: (...args: unknown[]) => {
                calls.push({ name: 'rename', args })
                return { ...group, name: 'Renamed' }
            },
            moveSessionsToGroup: (...args: unknown[]) => {
                calls.push({ name: 'move', args })
            },
            deleteSessionGroup: (...args: unknown[]) => {
                calls.push({ name: 'delete', args })
            },
            renameProject: (...args: unknown[]) => {
                calls.push({ name: 'rename-project', args })
                return { projectKey: '/project/a', name: 'Alpha', updatedAt: 2 }
            }
        }
        const app = createApp(engine)

        expect((await app.request('/api/session-groups?projectKey=%2Fproject%2Fa')).status).toBe(200)
        expect((await app.request('/api/session-groups', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ projectKey: '/project/a', name: 'Review' })
        })).status).toBe(201)
        expect((await app.request(`/api/session-groups/${groupId}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Renamed' })
        })).status).toBe(200)
        expect((await app.request('/api/session-groups/memberships', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionIds: ['session-1', 'session-2'], groupId })
        })).status).toBe(200)
        expect((await app.request('/api/projects/display-name', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ projectKey: '/project/a', name: ' Alpha ' })
        })).status).toBe(200)
        expect((await app.request(`/api/session-groups/${groupId}`, { method: 'DELETE' })).status).toBe(200)

        expect(calls).toEqual([
            { name: 'list', args: ['alpha', '/project/a'] },
            { name: 'create', args: ['alpha', '/project/a', 'Review'] },
            { name: 'rename', args: ['alpha', groupId, 'Renamed'] },
            { name: 'move', args: ['alpha', ['session-1', 'session-2'], groupId] },
            { name: 'rename-project', args: ['alpha', '/project/a', 'Alpha'] },
            { name: 'delete', args: ['alpha', groupId] }
        ])
    })

    it('rejects unknown fields, duplicate session ids, and invalid group ids', async () => {
        let called = false
        const app = createApp({
            createSessionGroup: () => {
                called = true
                throw new Error('must not be called')
            },
            moveSessionsToGroup: () => {
                called = true
            }
        })

        const extraField = await app.request('/api/session-groups', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ projectKey: '/project/a', name: 'Review', unexpected: true })
        })
        const duplicateIds = await app.request('/api/session-groups/memberships', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionIds: ['same', 'same'], groupId: null })
        })
        const invalidId = await app.request('/api/session-groups/not-a-uuid', { method: 'DELETE' })

        expect(extraField.status).toBe(400)
        expect(duplicateIds.status).toBe(400)
        expect(invalidId.status).toBe(400)
        expect(called).toBe(false)
    })
})
