import { describe, expect, it } from 'vitest'
import type { AgentTextBlock, ChatBlock, ToolCallBlock, UserTextBlock } from '@/chat/types'
import { deriveAgentProgress } from '@/components/AgentProgress/agentProgress'

function user(id: string, text: string): UserTextBlock {
    return { kind: 'user-text', id, localId: null, createdAt: 1, text }
}

function agent(id: string, text: string): AgentTextBlock {
    return { kind: 'agent-text', id, localId: null, createdAt: 1, text }
}

function tool(
    id: string,
    name: string,
    input: unknown,
    state: ToolCallBlock['tool']['state'] = 'completed',
): ToolCallBlock {
    return {
        kind: 'tool-call',
        id,
        localId: null,
        createdAt: 1,
        tool: {
            id,
            name,
            state,
            input,
            createdAt: 1,
            startedAt: state === 'pending' ? null : 1,
            completedAt: state === 'completed' || state === 'error' ? 2 : null,
            execStartedAt: null,
            execCompletedAt: null,
            description: null,
        },
        children: [],
    }
}

describe('deriveAgentProgress', () => {
    it('summarizes the current user turn and prefers the active plan step', () => {
        const blocks: ChatBlock[] = [
            user('u1', '重构并发布猫咪数独'),
            agent('a1', '先检查当前界面，再修复交互。'),
            tool('r1', 'CodexReasoning', { title: 'Inspecting the game view' }),
            tool('read1', 'Read', { file_path: 'Game.ts' }),
            tool('plan1', 'update_plan', {
                plan: [
                    { step: '检查当前实现', status: 'completed' },
                    { step: '修复点击交互', status: 'in_progress' },
                    { step: '发布并验收', status: 'pending' },
                ]
            }),
            tool('bash1', 'CodexBash', { command: 'bun test' }, 'running'),
        ]

        const progress = deriveAgentProgress(blocks, 'fallback')
        expect(progress.objective).toBe('重构并发布猫咪数独')
        expect(progress.progressMessage).toBe('先检查当前界面，再修复交互。')
        expect(progress.phase).toBe('修复点击交互')
        expect(progress.runningTool?.id).toBe('bash1')
        expect(progress.completedPhases).toBe(1)
        expect(progress.completedActions).toBe(1)
        expect(progress.planCompleted).toBe(1)
        expect(progress.planTotal).toBe(3)
    })

    it('uses the session title when the visible message window starts mid-turn', () => {
        const progress = deriveAgentProgress([
            tool('r1', 'CodexReasoning', { title: 'Checking deployment' }),
            tool('bash1', 'CodexBash', { command: 'bun run build' }, 'running'),
        ], '猫咪数独 H5 重构发布')

        expect(progress.objective).toBe('猫咪数独 H5 重构发布')
        expect(progress.phase).toBe('Checking deployment')
        expect(progress.runningTool?.id).toBe('bash1')
    })

    it('counts only work after the latest user message', () => {
        const progress = deriveAgentProgress([
            user('u1', '旧任务'),
            tool('old', 'Read', {}, 'completed'),
            user('u2', '新任务'),
            tool('r2', 'CodexReasoning', { title: 'New phase' }),
            tool('new', 'Edit', {}, 'completed'),
        ])

        expect(progress.objective).toBe('新任务')
        expect(progress.completedPhases).toBe(1)
        expect(progress.completedActions).toBe(1)
    })
})
