import {
    CreateSessionGroupInputSchema,
    MoveSessionsToGroupInputSchema,
    RenameSessionGroupInputSchema,
    SessionGroupIdSchema,
    SessionGroupProjectKeySchema
} from '@hapi/protocol/schemas'
import { Hono } from 'hono'
import type { SyncEngine } from '../../sync/syncEngine'
import { SessionGroupError } from '../../sync/sessionGroupService'
import type { WebAppEnv } from '../middleware/auth'
import { requireSyncEngine } from './guards'

function errorStatus(error: SessionGroupError): 400 | 404 | 409 {
    if (error.code === 'not-found') return 404
    if (error.code === 'invalid-project') return 400
    return 409
}

function errorResponse(error: SessionGroupError): { error: string; code: SessionGroupError['code'] } {
    return { error: error.message, code: error.code }
}

export function createSessionGroupsRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/session-groups', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const rawProjectKey = c.req.query('projectKey')
        let projectKey: string | undefined
        if (rawProjectKey !== undefined) {
            const parsed = SessionGroupProjectKeySchema.safeParse(rawProjectKey)
            if (!parsed.success) return c.json({ error: 'Invalid projectKey' }, 400)
            projectKey = parsed.data
        }

        return c.json(engine.getSessionGroups(c.get('namespace'), projectKey))
    })

    app.post('/session-groups', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const parsed = CreateSessionGroupInputSchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)

        try {
            const group = engine.createSessionGroup(
                c.get('namespace'),
                parsed.data.projectKey,
                parsed.data.name
            )
            return c.json({ group }, 201)
        } catch (error) {
            if (error instanceof SessionGroupError) {
                return c.json(errorResponse(error), errorStatus(error))
            }
            throw error
        }
    })

    app.patch('/session-groups/memberships', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const parsed = MoveSessionsToGroupInputSchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)

        try {
            engine.moveSessionsToGroup(c.get('namespace'), parsed.data.sessionIds, parsed.data.groupId)
            return c.json({ ok: true })
        } catch (error) {
            if (error instanceof SessionGroupError) {
                return c.json(errorResponse(error), errorStatus(error))
            }
            throw error
        }
    })

    app.patch('/session-groups/:id', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const id = SessionGroupIdSchema.safeParse(c.req.param('id'))
        const body = RenameSessionGroupInputSchema.safeParse(await c.req.json().catch(() => null))
        if (!id.success || !body.success) return c.json({ error: 'Invalid request' }, 400)

        try {
            const group = engine.renameSessionGroup(c.get('namespace'), id.data, body.data.name)
            return c.json({ group })
        } catch (error) {
            if (error instanceof SessionGroupError) {
                return c.json(errorResponse(error), errorStatus(error))
            }
            throw error
        }
    })

    app.delete('/session-groups/:id', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine

        const id = SessionGroupIdSchema.safeParse(c.req.param('id'))
        if (!id.success) return c.json({ error: 'Invalid group id' }, 400)

        try {
            engine.deleteSessionGroup(c.get('namespace'), id.data)
            return c.json({ ok: true })
        } catch (error) {
            if (error instanceof SessionGroupError) {
                return c.json(errorResponse(error), errorStatus(error))
            }
            throw error
        }
    })

    return app
}
