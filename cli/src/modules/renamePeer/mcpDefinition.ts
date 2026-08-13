import { z } from 'zod'
import { RenameSessionRequestSchema } from '@hapi/protocol/apiTypes'
import { SESSION_ID_PREFIX_PARAM_DESCRIPTION } from '@hapi/protocol/sessionCitation'

export const renamePeerToolDefinition = {
    title: 'Rename Peer Session',
    description: 'Persistently rename one peer HAPI session in the same hub, namespace, and project as the current session. Uses the same metadata.name update as Web More actions → Rename. Requires manual approval in every permission mode.',
    inputSchema: z.object({
        sessionIdPrefix: z.string().trim().min(1).describe(SESSION_ID_PREFIX_PARAM_DESCRIPTION),
        title: RenameSessionRequestSchema.shape.name.describe('New persistent peer session title (1-255 characters)')
    })
} as const
