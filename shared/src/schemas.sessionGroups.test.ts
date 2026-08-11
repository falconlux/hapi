import { describe, expect, it } from 'bun:test'
import {
    CreateSessionGroupInputSchema,
    MoveSessionsToGroupInputSchema,
    SessionGroupsResponseSchema,
    SyncEventSchema
} from './schemas'

describe('session group schemas', () => {
    it('trims valid names and rejects unknown fields', () => {
        expect(CreateSessionGroupInputSchema.parse({
            projectKey: ' /project/a ',
            name: ' Review '
        })).toEqual({ projectKey: '/project/a', name: 'Review' })
        expect(CreateSessionGroupInputSchema.safeParse({
            projectKey: '/project/a',
            name: 'Review',
            extra: true
        }).success).toBe(false)
    })

    it('requires a bounded unique batch and nullable UUID group id', () => {
        expect(MoveSessionsToGroupInputSchema.parse({
            sessionIds: ['session-1'],
            groupId: null
        })).toEqual({ sessionIds: ['session-1'], groupId: null })
        expect(MoveSessionsToGroupInputSchema.safeParse({
            sessionIds: ['same', 'same'],
            groupId: null
        }).success).toBe(false)
    })

    it('keeps response and SSE payloads strict', () => {
        expect(SessionGroupsResponseSchema.safeParse({
            groups: [],
            memberships: [],
            extra: true
        }).success).toBe(false)
        expect(SyncEventSchema.parse({
            type: 'session-groups-updated',
            namespace: 'alpha'
        })).toEqual({ type: 'session-groups-updated', namespace: 'alpha' })
    })
})
