import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ToolCallBlock } from '@/chat/types'
import { ToolCard } from '@/components/ToolCard/ToolCard'
import { I18nProvider } from '@/lib/i18n-context'

function makeReasoningBlock(
    content: string | null,
    options: {
        state?: ToolCallBlock['tool']['state']
        liveSummary?: string
    } = {}
): ToolCallBlock {
    const state = options.state ?? 'completed'
    return {
        kind: 'tool-call',
        id: 'reasoning-1',
        localId: null,
        createdAt: 1,
        invokedAt: null,
        tool: {
            id: 'reasoning-1',
            name: 'CodexReasoning',
            state,
            input: {
                title: '检查消息分组',
                ...(options.liveSummary ? { summary: options.liveSummary } : {})
            },
            createdAt: 1,
            startedAt: 1,
            completedAt: state === 'completed' ? 2 : null,
            execStartedAt: null,
            execCompletedAt: null,
            description: null,
            result: content === null ? undefined : { content, status: 'completed' },
            permission: undefined,
        },
        children: [],
    }
}

describe('ToolCard Codex reasoning preview', () => {
    it('shows useful public reasoning text inline without opening details', () => {
        render(
            <I18nProvider>
                <ToolCard
                    api={{} as never}
                    sessionId="session-1"
                    metadata={null}
                    terminalToolDisplayMode="compact"
                    disabled={false}
                    onDone={vi.fn()}
                    block={makeReasoningBlock('发现 CLI 已经请求详细摘要，缺口在 Web 展示层。下一步修复分组。')}
                />
            </I18nProvider>
        )

        expect(screen.getByText('发现 CLI 已经请求详细摘要，缺口在 Web 展示层。下一步修复分组。'))
            .toBeInTheDocument()
    })

    it('keeps title-only noise out of the inline body', () => {
        render(
            <I18nProvider>
                <ToolCard
                    api={{} as never}
                    sessionId="session-1"
                    metadata={null}
                    terminalToolDisplayMode="compact"
                    disabled={false}
                    onDone={vi.fn()}
                    block={makeReasoningBlock('**更新最终词汇映射**')}
                />
            </I18nProvider>
        )

        expect(screen.queryByText('更新最终词汇映射')).not.toBeInTheDocument()
    })

    it('shows the public summary while reasoning is still running', () => {
        render(
            <I18nProvider>
                <ToolCard
                    api={{} as never}
                    sessionId="session-1"
                    metadata={null}
                    terminalToolDisplayMode="compact"
                    disabled={false}
                    onDone={vi.fn()}
                    block={makeReasoningBlock(null, {
                        state: 'running',
                        liveSummary: 'CLI 已开始流式发送公开摘要，正在检查 Web 展示。'
                    })}
                />
            </I18nProvider>
        )

        expect(screen.getByText('CLI 已开始流式发送公开摘要，正在检查 Web 展示。'))
            .toBeInTheDocument()
    })
})
