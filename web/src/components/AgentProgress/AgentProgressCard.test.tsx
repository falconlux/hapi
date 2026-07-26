import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatBlock, ToolCallBlock } from '@/chat/types'
import { AgentProgressCard, localizeAgentPhase } from '@/components/AgentProgress/AgentProgressCard'
import { I18nProvider } from '@/lib/i18n-context'

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
            startedAt: 1,
            completedAt: state === 'completed' ? 2 : null,
            execStartedAt: null,
            execCompletedAt: null,
            description: null,
        },
        children: [],
    }
}

describe('localizeAgentPhase', () => {
    it('turns common English Codex activity headings into Chinese action labels', () => {
        expect(localizeAgentPhase('Planning canvas mouse event dispatch', 'zh-CN'))
            .toBe('正在规划：canvas mouse event dispatch')
        expect(localizeAgentPhase('Debugging grid child indexing', 'zh-CN'))
            .toBe('正在排查：grid child indexing')
    })

    it('keeps Chinese and English-locale titles unchanged', () => {
        expect(localizeAgentPhase('正在发布游戏', 'zh-CN')).toBe('正在发布游戏')
        expect(localizeAgentPhase('Planning release', 'en')).toBe('Planning release')
    })
})

describe('AgentProgressCard', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: vi.fn(() => 'zh-CN'),
                setItem: vi.fn(),
                removeItem: vi.fn(),
                clear: vi.fn(),
                key: vi.fn(() => null),
                length: 0,
            },
            configurable: true,
        })
    })

    afterEach(() => cleanup())

    it('keeps the goal, phase, concrete action, and progress visible while running', () => {
        const blocks: ChatBlock[] = [
            { kind: 'user-text', id: 'u1', localId: null, createdAt: 1, text: '重构并发布猫咪数独' },
            tool('r1', 'CodexReasoning', { title: 'Planning canvas mouse event dispatch' }),
            tool('read1', 'Read', { file_path: 'Game.ts' }),
            tool('bash1', 'CodexBash', { command: 'bb-browser screenshot /tmp/game.png' }, 'running'),
        ]

        render(
            <I18nProvider>
                <AgentProgressCard
                    blocks={blocks}
                    fallbackObjective="猫咪数独 H5 重构发布"
                    isRunning
                    metadata={{ path: '/repo', host: 'local' }}
                />
            </I18nProvider>,
        )

        expect(screen.getByText('Codex 正在执行')).toBeInTheDocument()
        expect(screen.getByText('正在规划：canvas mouse event dispatch')).toBeInTheDocument()
        expect(screen.getByText('正在浏览器中操作并检查应用')).toBeInTheDocument()
        expect(screen.getByText('重构并发布猫咪数独')).toBeInTheDocument()
        expect(screen.getByText('已完成 1 个阶段 · 1 项操作')).toBeInTheDocument()
    })
})
