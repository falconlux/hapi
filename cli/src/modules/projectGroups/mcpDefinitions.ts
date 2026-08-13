import { z } from 'zod'
import {
    MoveSessionsToGroupInputSchema,
    SessionGroupIdSchema,
    SessionGroupNameSchema,
    SessionGroupProjectKeySchema
} from '@hapi/protocol/schemas'

export const PROJECT_GROUP_TOOL_NAMES = [
    'list_project_groups',
    'create_project_group',
    'rename_project_group',
    'delete_project_group',
    'move_sessions_to_group'
] as const

export const PROJECT_GROUP_WRITE_TOOL_NAMES = new Set<string>(PROJECT_GROUP_TOOL_NAMES.slice(1))

export const projectGroupToolDefinitions = {
    list_project_groups: {
        title: 'List Project Groups',
        description: 'Read-only. List HAPI project groups and membership counts, including each session id/title/path/archived state and sessions not assigned to a named group. Optionally filter by exact projectKey. Uses the current HAPI hub and namespace.',
        inputSchema: z.object({ projectKey: SessionGroupProjectKeySchema.optional() })
    },
    create_project_group: {
        title: 'Create Project Group',
        description: 'Create a named HAPI session group for an existing project. This changes project organization and requires manual approval.',
        inputSchema: z.object({ projectKey: SessionGroupProjectKeySchema, name: SessionGroupNameSchema })
    },
    rename_project_group: {
        title: 'Rename Project Group',
        description: 'Rename an existing HAPI project group. This changes project organization and requires manual approval.',
        inputSchema: z.object({ groupId: SessionGroupIdSchema, name: SessionGroupNameSchema })
    },
    delete_project_group: {
        title: 'Delete Project Group',
        description: 'Delete a HAPI project group. Sessions are NOT deleted; they return to the project\'s unassigned/outer list. Requires manual approval.',
        inputSchema: z.object({ groupId: SessionGroupIdSchema })
    },
    move_sessions_to_group: {
        title: 'Move Sessions To Group',
        description: 'Move one or more HAPI sessions to a named project group. Pass groupId=null to remove them from any named group and return them to the project\'s unassigned/outer list. Requires manual approval.',
        inputSchema: MoveSessionsToGroupInputSchema
    }
} as const
