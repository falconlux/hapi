import { describe, expect, it, vi } from 'vitest';
import { PermissionHandler } from './permissionHandler';
import { PLAN_FAKE_REJECT, PLAN_FAKE_RESTART } from '../sdk/prompts';
import type { Session } from '../session';

function createFakeSession() {
    const queueItems: { message: string; mode: unknown }[] = [];
    let permissionMode: string | undefined;

    const session = {
        client: {
            rpcHandlerManager: {
                registerHandler: vi.fn(),
            },
            updateAgentState: vi.fn(),
        },
        queue: {
            unshift: vi.fn((message: string, mode: unknown) => {
                queueItems.push({ message, mode });
            }),
        },
        setPermissionMode: vi.fn((mode: string) => {
            permissionMode = mode;
        }),
        getPermissionMode: vi.fn(() => permissionMode),
    } as unknown as Session;

    return { session, queueItems };
}

describe('PermissionHandler — YOLO plan mode', () => {
    it('injects PLAN_FAKE_RESTART and denies exit_plan_mode in bypassPermissions', async () => {
        const { session, queueItems } = createFakeSession();
        const handler = new PermissionHandler(session);
        handler.handleModeChange('bypassPermissions');

        // Simulate Claude emitting an assistant message with exit_plan_mode tool_use
        handler.onMessage({
            type: 'assistant',
            message: {
                role: 'assistant',
                content: [{ type: 'tool_use', id: 'tc-1', name: 'exit_plan_mode', input: {} }],
            },
        } as any);

        const result = await handler.handleToolCall(
            'exit_plan_mode',
            {},
            { permissionMode: 'bypassPermissions' } as any,
            { signal: new AbortController().signal }
        );

        // Should deny with PLAN_FAKE_REJECT (so Claude restarts)
        expect(result.behavior).toBe('deny');
        expect(result).toEqual({ behavior: 'deny', message: PLAN_FAKE_REJECT });

        // Should inject PLAN_FAKE_RESTART into the queue
        expect(queueItems).toHaveLength(1);
        expect(queueItems[0].message).toBe(PLAN_FAKE_RESTART);
        expect(queueItems[0].mode).toEqual({ permissionMode: 'bypassPermissions' });
    });

    it('injects PLAN_FAKE_RESTART for ExitPlanMode variant', async () => {
        const { session, queueItems } = createFakeSession();
        const handler = new PermissionHandler(session);
        handler.handleModeChange('bypassPermissions');

        handler.onMessage({
            type: 'assistant',
            message: {
                role: 'assistant',
                content: [{ type: 'tool_use', id: 'tc-2', name: 'ExitPlanMode', input: {} }],
            },
        } as any);

        const result = await handler.handleToolCall(
            'ExitPlanMode',
            {},
            { permissionMode: 'bypassPermissions' } as any,
            { signal: new AbortController().signal }
        );

        expect(result.behavior).toBe('deny');
        expect(result).toEqual({ behavior: 'deny', message: PLAN_FAKE_REJECT });
        expect(queueItems).toHaveLength(1);
        expect(queueItems[0].message).toBe(PLAN_FAKE_RESTART);
    });

    it('allows normal tools in bypassPermissions without queue injection', async () => {
        const { session, queueItems } = createFakeSession();
        const handler = new PermissionHandler(session);
        handler.handleModeChange('bypassPermissions');

        handler.onMessage({
            type: 'assistant',
            message: {
                role: 'assistant',
                content: [{ type: 'tool_use', id: 'tc-3', name: 'Bash', input: { command: 'ls' } }],
            },
        } as any);

        const result = await handler.handleToolCall(
            'Bash',
            { command: 'ls' },
            { permissionMode: 'bypassPermissions' } as any,
            { signal: new AbortController().signal }
        );

        expect(result.behavior).toBe('allow');
        expect(queueItems).toHaveLength(0);
    });

    it.each([
        'mcp__hapi__create_project_group',
        'mcp__hapi__rename_project_group',
        'mcp__hapi__delete_project_group',
        'mcp__hapi__move_sessions_to_group',
        'mcp__hapi__rename_peer',
        'mcp__hapi__archive_peer',
        'mcp__hapi__unarchive_peer',
        'mcp__hapi__delete_peer'
    ])('forces manual approval for %s in bypassPermissions', async (toolName) => {
        const { session } = createFakeSession();
        const handler = new PermissionHandler(session);
        handler.handleModeChange('bypassPermissions');

        handler.onMessage({
            type: 'assistant',
            message: {
                role: 'assistant',
                content: [{ type: 'tool_use', id: `tc-${toolName}`, name: toolName, input: {} }],
            },
        } as any);

        const pending = handler.handleToolCall(
            toolName,
            {},
            { permissionMode: 'bypassPermissions' } as any,
            { signal: new AbortController().signal }
        );

        await Promise.resolve();
        expect(session.client.updateAgentState).toHaveBeenCalledWith(expect.any(Function));

        const permissionRpc = (session.client.rpcHandlerManager.registerHandler as ReturnType<typeof vi.fn>)
            .mock.calls.find(([method]) => method === 'permission')?.[1] as ((response: unknown) => Promise<unknown>) | undefined;
        expect(permissionRpc).toBeTypeOf('function');
        await permissionRpc?.({ id: `tc-${toolName}`, approved: false, reason: 'manual denial' });

        await expect(pending).resolves.toEqual({ behavior: 'deny', message: 'manual denial' });
    });

    it('does not let a prior allowTools grant bypass manual approval for project group writes', async () => {
        const { session } = createFakeSession();
        const handler = new PermissionHandler(session);
        handler.handleModeChange('default');
        const toolName = 'mcp__hapi__create_project_group';

        handler.onMessage({
            type: 'assistant',
            message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tc-first', name: 'Read', input: {} }] },
        } as any);
        const first = handler.handleToolCall('Read', {}, { permissionMode: 'default' } as any, { signal: new AbortController().signal });
        const permissionRpc = (session.client.rpcHandlerManager.registerHandler as ReturnType<typeof vi.fn>)
            .mock.calls.find(([method]) => method === 'permission')?.[1] as ((response: unknown) => Promise<unknown>) | undefined;
        await permissionRpc?.({ id: 'tc-first', approved: true, allowTools: [toolName] });
        await expect(first).resolves.toMatchObject({ behavior: 'allow' });

        handler.handleModeChange('bypassPermissions');
        handler.onMessage({
            type: 'assistant',
            message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tc-write', name: toolName, input: {} }] },
        } as any);
        const write = handler.handleToolCall(toolName, {}, { permissionMode: 'bypassPermissions' } as any, { signal: new AbortController().signal });
        await Promise.resolve();
        await permissionRpc?.({ id: 'tc-write', approved: false, reason: 'still manual' });
        await expect(write).resolves.toEqual({ behavior: 'deny', message: 'still manual' });
    });

    // Regression: turn-in-progress switch from default to bypassPermissions via
    // SetSessionConfig RPC updates session.setPermissionMode but doesn't go
    // through handler.handleModeChange. The next canCallTool must reflect the
    // new mode. See issue #735.
    it('reflects session permission mode changes between tool calls', async () => {
        const { session } = createFakeSession();
        const handler = new PermissionHandler(session);
        handler.handleModeChange('default');

        // Simulate RPC handler in runClaude updating the session directly,
        // bypassing handler.handleModeChange (as happens on web dropdown change).
        session.setPermissionMode('bypassPermissions');

        handler.onMessage({
            type: 'assistant',
            message: {
                role: 'assistant',
                content: [{ type: 'tool_use', id: 'tc-4', name: 'Bash', input: { command: 'ls' } }],
            },
        } as any);

        const result = await handler.handleToolCall(
            'Bash',
            { command: 'ls' },
            { permissionMode: 'bypassPermissions' } as any,
            { signal: new AbortController().signal }
        );

        expect(result.behavior).toBe('allow');
    });
});
