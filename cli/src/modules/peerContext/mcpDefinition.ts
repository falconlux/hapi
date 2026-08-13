import { z } from 'zod'
import { SESSION_ID_PREFIX_PARAM_DESCRIPTION } from '@hapi/protocol/sessionCitation'

const inputSchema = z.object({
    sessionIdPrefix: z.string().trim().min(1).describe(SESSION_ID_PREFIX_PARAM_DESCRIPTION)
})

export const compactPeerToolDefinition = {
    title: 'Compact Peer Session',
    description: 'Compact one active Codex or OpenCode peer through its native agent runtime. Requires the same namespace and canonical project, a unique id prefix, and a target other than the caller. Unsupported flavors fail closed.',
    inputSchema
} as const

export const resetPeerToolDefinition = {
    title: 'Reset Peer Session',
    description: 'Reset one active OpenCode peer through its native agent runtime. Requires confirm=true, the same namespace and canonical project, a unique id prefix, and a target other than the caller. Claude and unsupported flavors fail closed unless a reliable native reset is available.',
    inputSchema: inputSchema.extend({
        confirm: z.literal(true).describe('Must be exactly true to confirm destructive context reset')
    })
} as const
