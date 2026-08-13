import { describe, expect, it } from 'vitest'
import { resolveToolAutoApprovalDecision } from './BasePermissionHandler'

describe('resolveToolAutoApprovalDecision skill_lookup', () => {
    it.each([
        'skill_lookup',
        'hapi_skill_lookup',
        'happy__skill_lookup',
        'mcp__hapi__skill_lookup'
    ])('auto-approves the exact read-only HAPI tool name %s', (toolName) => {
        expect(resolveToolAutoApprovalDecision(
            'default',
            toolName,
            'call-1'
        )).toBe('approved')
    })

    it('does not approve another tool solely from a skill-looking call id', () => {
        expect(resolveToolAutoApprovalDecision(
            'default',
            'dangerous_tool',
            'skill_lookup-forged-id'
        )).toBeNull()
    })

    it('does not approve another tool whose name only contains skill_lookup', () => {
        expect(resolveToolAutoApprovalDecision(
            'default',
            'skill_lookup_write_file',
            'call-1'
        )).toBeNull()
        expect(resolveToolAutoApprovalDecision(
            'default',
            'dangerous_skill_lookup',
            'call-2'
        )).toBeNull()
    })
})

describe('resolveToolAutoApprovalDecision ping_peer', () => {
    it.each([
        'ping_peer',
        'mcp__hapi__ping_peer',
        'hapi_ping_peer',
        'Ping Peer Session'
    ])('does not auto-approve %s in default mode', (toolName) => {
        expect(resolveToolAutoApprovalDecision('default', toolName, 'call-1')).toBeNull()
    })

    it.each([
        'ping_peer',
        'mcp__hapi__ping_peer',
        'hapi_ping_peer',
        'Ping Peer Session'
    ])('does not auto-approve %s in read-only mode', (toolName) => {
        expect(resolveToolAutoApprovalDecision('read-only', toolName, 'call-1')).toBeNull()
    })

    it('still auto-approves unrelated read tools in read-only mode', () => {
        expect(resolveToolAutoApprovalDecision('read-only', 'Read', 'call-1')).toBe('approved')
        expect(resolveToolAutoApprovalDecision('read-only', 'grep', 'call-2')).toBe('approved')
    })
})

describe('resolveToolAutoApprovalDecision inspect_peer', () => {
    it.each([
        'inspect_peer',
        'mcp__hapi__inspect_peer',
        'hapi_inspect_peer',
        'Inspect Peer Session'
    ])('does not auto-approve %s in default mode', (toolName) => {
        expect(resolveToolAutoApprovalDecision('default', toolName, 'call-1')).toBeNull()
    })

    it.each([
        'inspect_peer',
        'mcp__hapi__inspect_peer',
        'hapi_inspect_peer',
        'Inspect Peer Session'
    ])('does not auto-approve %s in read-only mode', (toolName) => {
        expect(resolveToolAutoApprovalDecision('read-only', toolName, 'call-1')).toBeNull()
    })
})

describe('resolveToolAutoApprovalDecision list_peers', () => {
    it.each([
        'list_peers',
        'hapi_list_peers',
        'happy__list_peers',
        'mcp__hapi__list_peers',
        'List Peer Sessions'
    ])('auto-approves the exact discovery tool name %s', (toolName) => {
        expect(resolveToolAutoApprovalDecision('default', toolName, 'call-1')).toBe('approved')
    })

    it('does not approve another tool whose name only contains list_peers', () => {
        expect(resolveToolAutoApprovalDecision(
            'default',
            'list_peers_and_write',
            'call-1'
        )).toBeNull()
    })
})

describe('resolveToolAutoApprovalDecision project groups', () => {
    it.each([
        'list_project_groups',
        'hapi_list_project_groups',
        'happy__list_project_groups',
        'mcp__hapi__list_project_groups',
        'List Project Groups'
    ])('auto-approves the exact read-only tool %s', (toolName) => {
        expect(resolveToolAutoApprovalDecision('default', toolName, 'call-1')).toBe('approved')
    })

    it.each([
        'create_project_group',
        'mcp__hapi__create_project_group',
        'hapi_create_project_group',
        'Create Project Group',
        'rename_project_group',
        'mcp__hapi__rename_project_group',
        'Rename Project Group',
        'delete_project_group',
        'happy__delete_project_group',
        'Delete Project Group',
        'move_sessions_to_group',
        'mcp__hapi__move_sessions_to_group',
        'Move Sessions To Group',
        'rename_peer',
        'hapi_rename_peer',
        'happy__rename_peer',
        'mcp__hapi__rename_peer',
        'Rename Peer Session'
    ])('keeps the write tool %s pending in every permission mode', (toolName) => {
        for (const mode of [
            undefined,
            'default',
            'read-only',
            'safe-yolo',
            'yolo',
            'always-proceed'
        ] as const) {
            expect(resolveToolAutoApprovalDecision(mode, toolName, 'call-1')).toBeNull()
        }
    })

    it('does not let rule overrides or a forged auto-approved call id bypass the exact-name gate', () => {
        expect(resolveToolAutoApprovalDecision(
            'yolo',
            'create_project_group',
            'change_title-forged',
            {
                alwaysToolNameHints: ['create_project_group'],
                alwaysToolIdHints: ['change_title']
            }
        )).toBeNull()
    })
})
