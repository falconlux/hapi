import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatBlock, ToolCallBlock } from '@/chat/types'
import { AgentProgressCard } from '@/components/AgentProgress/AgentProgressCard'
import { localizeCodexActivityTitle } from '@/lib/codexActivityTitle'
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

describe('localizeCodexActivityTitle', () => {
    it('turns common English Codex activity headings into Chinese action labels', () => {
        expect(localizeCodexActivityTitle('Planning canvas mouse event dispatch', 'zh-CN'))
            .toBe('正在规划：canvas mouse event dispatch')
        expect(localizeCodexActivityTitle('Debugging grid child indexing', 'zh-CN'))
            .toBe('正在排查：grid child indexing')
        expect(localizeCodexActivityTitle('Marking missing README step completed', 'zh-CN'))
            .toBe('正在处理：missing README step completed')
    })

    it('keeps Chinese and English-locale titles unchanged', () => {
        expect(localizeCodexActivityTitle('正在发布游戏', 'zh-CN')).toBe('正在发布游戏')
        expect(localizeCodexActivityTitle('Planning release', 'en')).toBe('Planning release')
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

    it('collapses the persistent card and remembers the preference', () => {
        const blocks: ChatBlock[] = [
            { kind: 'user-text', id: 'u1', localId: null, createdAt: 1, text: '发布修复' },
            tool('r1', 'CodexReasoning', { title: 'Deploying progress UI' }),
        ]

        render(
            <I18nProvider>
                <AgentProgressCard
                    blocks={blocks}
                    fallbackObjective="发布修复"
                    isRunning
                    metadata={null}
                />
            </I18nProvider>,
        )

        const collapse = screen.getByRole('button', { name: '收起执行进度' })
        expect(collapse).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByText('正在发布：progress UI')).toBeInTheDocument()

        fireEvent.click(collapse)

        expect(screen.getByRole('button', { name: '展开执行进度' })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText('正在发布：progress UI')).not.toBeInTheDocument()
        expect(window.localStorage.setItem).toHaveBeenCalledWith('hapi-agent-progress-collapsed', '1')
    })
})
