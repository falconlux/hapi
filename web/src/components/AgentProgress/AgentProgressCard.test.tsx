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
    it('localizes both the action and common engineering details', () => {
        expect(localizeCodexActivityTitle('Planning canvas mouse event dispatch', 'zh-CN'))
            .toBe('正在规划：画布鼠标事件分发')
        expect(localizeCodexActivityTitle('Debugging grid child indexing', 'zh-CN'))
            .toBe('正在排查：网格子项索引')
        expect(localizeCodexActivityTitle('Marking missing README step completed', 'zh-CN'))
            .toBe('正在处理：缺失的 README 步骤已完成')
        expect(localizeCodexActivityTitle('Requesting evaluation card text', 'zh-CN'))
            .toBe('正在获取：验收卡片文字')
        expect(localizeCodexActivityTitle('Executing browser verification and type checks', 'zh-CN'))
            .toBe('正在执行：浏览器验收和类型检查')
        expect(localizeCodexActivityTitle('Building production bundle', 'zh-CN'))
            .toBe('正在构建：生产环境资源包')
        expect(localizeCodexActivityTitle('正在检查：current session state', 'zh-CN'))
            .toBe('正在检查：当前会话状态')
    })

    it('keeps code identifiers and English-locale titles unchanged', () => {
        expect(localizeCodexActivityTitle('正在发布游戏', 'zh-CN')).toBe('正在发布游戏')
        expect(localizeCodexActivityTitle('Inspecting web/src/AgentProgressCard.tsx', 'zh-CN'))
            .toBe('正在检查：web/src/AgentProgressCard.tsx')
        expect(localizeCodexActivityTitle('Running bun run build:web', 'zh-CN'))
            .toBe('正在执行：bun run build:web')
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
        expect(screen.getByText('正在规划：画布鼠标事件分发')).toBeInTheDocument()
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
        expect(screen.getByText('正在发布：进度界面')).toBeInTheDocument()

        fireEvent.click(collapse)

        expect(screen.getByRole('button', { name: '展开执行进度' })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText('正在发布：进度界面')).not.toBeInTheDocument()
        expect(window.localStorage.setItem).toHaveBeenCalledWith('hapi-agent-progress-collapsed', '1')
    })
})
