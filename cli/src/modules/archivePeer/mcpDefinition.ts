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
