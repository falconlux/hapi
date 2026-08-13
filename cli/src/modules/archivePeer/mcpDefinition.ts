import { z } from 'zod'
import { SESSION_ID_PREFIX_PARAM_DESCRIPTION } from '@hapi/protocol/sessionCitation'

const inputSchema = z.object({
    sessionIdPrefix: z.string().trim().min(1).describe(SESSION_ID_PREFIX_PARAM_DESCRIPTION)
})

export const archivePeerToolDefinition = {
    title: 'Archive Peer Session',
    description: 'Persistently archive one peer HAPI session in the same namespace and project. Active sessions are stopped through the existing safe archive RPC. History and group membership are preserved. Idempotent and always requires manual approval.',
    inputSchema
} as const

export const unarchivePeerToolDefinition = {
    title: 'Unarchive Peer Session',
    description: 'Persistently restore one archived peer HAPI session in the same namespace and project without resuming or spawning its agent process. History and group membership are preserved. Idempotent and always requires manual approval.',
    inputSchema
} as const

export const deletePeerToolDefinition = {
    title: 'Delete Peer Session',
    description: 'Permanently delete one peer HAPI session in the same namespace and project using the same semantics as the Web sidebar delete action. Active sessions are safely archived/stopped first. Deletes history and group membership. Requires confirm=true and manual approval.',
    inputSchema: inputSchema.extend({
        confirm: z.literal(true).describe('Must be exactly true to confirm permanent deletion')
    })
} as const

export const restartPeerToolDefinition = {
    title: 'Restart Peer Session',
    description: 'Restart one peer HAPI session in the same namespace and project while preserving its session id, history, name, and group. Active targets are safely archived/stopped and observed inactive before reopen; inactive or archived targets are reopened directly. Concurrent already-running reopen is treated as success. Always requires manual approval.',
    inputSchema
} as const
