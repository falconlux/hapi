import { useMemo } from 'react'
import type { ChatBlock, ToolCallBlock } from '@/chat/types'
import { deriveAgentProgress } from '@/components/AgentProgress/agentProgress'
import { getToolGroupActionKind } from '@/chat/toolGroups'
import { getToolPresentation } from '@/components/ToolCard/knownTools'
import type { SessionMetadataSummary } from '@/types/api'
import { getInputStringAny, truncate } from '@/lib/toolInputUtils'
import { useTranslation, type Locale } from '@/lib/use-translation'

type Translator = (key: string, params?: Record<string, string | number>) => string

const PHASE_VERBS_ZH: Array<[RegExp, string]> = [
    [/^(?:Checking|Inspecting|Reviewing|Reading)\s+/i, '正在检查：'],
    [/^(?:Diagnosing|Debugging|Investigating|Tracing)\s+/i, '正在排查：'],
    [/^(?:Planning|Designing)\s+/i, '正在规划：'],
    [/^(?:Testing|Verifying|Validating)\s+/i, '正在验证：'],
    [/^(?:Implementing|Adding|Creating|Building)\s+/i, '正在实现：'],
    [/^(?:Updating|Changing|Adjusting|Refactoring|Simplifying)\s+/i, '正在修改：'],
    [/^(?:Running|Executing)\s+/i, '正在执行：'],
    [/^(?:Capturing|Taking)\s+/i, '正在获取：'],
    [/^(?:Selecting|Choosing)\s+/i, '正在选择：'],
    [/^(?:Closing|Opening|Claiming)\s+/i, '正在处理：'],
    [/^(?:Deploying|Publishing|Releasing)\s+/i, '正在发布：'],
]

export function localizeAgentPhase(value: string, locale: Locale): string {
    if (locale !== 'zh-CN' || /[\u3400-\u9fff]/.test(value)) return value
    for (const [pattern, prefix] of PHASE_VERBS_ZH) {
        if (pattern.test(value)) {
            return `${prefix}${value.replace(pattern, '')}`
        }
    }
    return value
}

function getCommandText(block: ToolCallBlock): string | null {
    const direct = getInputStringAny(block.tool.input, ['command', 'cmd'])
    if (direct) return direct
    if (!block.tool.input || typeof block.tool.input !== 'object') return null
    const command = (block.tool.input as { command?: unknown }).command
    if (!Array.isArray(command)) return null
    const parts = command.filter((part): part is string => typeof part === 'string' && part.length > 0)
    return parts.length > 0 ? parts.join(' ') : null
}

function formatRunningAction(
    block: ToolCallBlock,
    t: Translator,
    metadata: SessionMetadataSummary | null,
): string {
    const command = getCommandText(block)
    const lowerCommand = command?.toLowerCase() ?? ''
    if (/\b(?:bb-browser|playwright|puppeteer|chromium?|cdp)\b/.test(lowerCommand)) {
        return t('agentProgress.action.browser')
    }
    if (/\b(?:screenshot|capture|snapshot)\b/.test(lowerCommand)) {
        return t('agentProgress.action.screenshot')
    }
    if (/\b(?:test|vitest|jest|pytest|node --test)\b/.test(lowerCommand)) {
        return t('agentProgress.action.tests')
    }
    if (/\b(?:build|typecheck|tsc|lint)\b/.test(lowerCommand)) {
        return t('agentProgress.action.verify')
    }
    if (/\b(?:deploy|publish|release|rsync|scp|pm2)\b/.test(lowerCommand)) {
        return t('agentProgress.action.deploy')
    }

    switch (getToolGroupActionKind(block)) {
        case 'read':
            return t('agentProgress.action.inspect')
        case 'search':
            return t('agentProgress.action.search')
        case 'command':
            return t('agentProgress.action.command')
        case 'mutation':
            return t('agentProgress.action.edit')
        case 'web':
            return t('agentProgress.action.browser')
        default: {
            const presentation = getToolPresentation({
                toolName: block.tool.name,
                input: block.tool.input,
                result: block.tool.result,
                childrenCount: block.children.length,
                description: block.tool.nativeTitle ?? block.tool.description,
                metadata,
            }, t)
            return presentation.title
        }
    }
}

export function AgentProgressCard(props: {
    blocks: readonly ChatBlock[]
    fallbackObjective: string
    isRunning: boolean
    metadata: SessionMetadataSummary | null
}) {
    const { t, locale } = useTranslation()
    const progress = useMemo(
        () => deriveAgentProgress(props.blocks, props.fallbackObjective),
        [props.blocks, props.fallbackObjective],
    )

    if (!props.isRunning) return null

    const primaryProgress = progress.progressMessage ?? progress.phase ?? t('agentProgress.preparing')
    const localizedPrimary = localizeAgentPhase(primaryProgress, locale)
    const localizedPhase = progress.phase ? localizeAgentPhase(progress.phase, locale) : null
    const showSeparatePhase = Boolean(
        progress.progressMessage
        && localizedPhase
        && localizedPhase !== localizedPrimary,
    )
    const runningAction = progress.runningTool
        ? formatRunningAction(progress.runningTool, t, props.metadata)
        : t('agentProgress.action.thinking')
    const progressLabel = progress.planTotal !== null && progress.planCompleted !== null
        ? t('agentProgress.planCount', { completed: progress.planCompleted, total: progress.planTotal })
        : t('agentProgress.workCount', {
            phases: progress.completedPhases,
            actions: progress.completedActions,
        })

    return (
        <div className="px-3 pb-2" aria-live="polite" data-testid="agent-progress-card">
            <div className="mx-auto w-full max-w-content rounded-2xl border border-sky-500/25 bg-sky-500/5 px-3 py-2.5 shadow-sm">
                <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-sky-700 dark:text-sky-300">
                        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" aria-hidden="true" />
                        <span className="truncate">{t('agentProgress.running')}</span>
                    </div>
                    <span className="shrink-0 text-[11px] text-[var(--app-hint)]">{progressLabel}</span>
                </div>

                <div className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-[var(--app-fg)]">
                    {truncate(localizedPrimary, 180)}
                </div>

                {showSeparatePhase ? (
                    <div className="mt-1 truncate text-xs text-[var(--app-hint)]">
                        {t('agentProgress.phase')}: {truncate(localizedPhase ?? '', 140)}
                    </div>
                ) : null}

                <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-[var(--app-hint)]">
                    <span className="shrink-0">{t('agentProgress.action')}:</span>
                    <span className="min-w-0 truncate">{runningAction}</span>
                </div>

                {progress.objective ? (
                    <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-[var(--app-hint)]">
                        <span className="shrink-0">{t('agentProgress.objective')}:</span>
                        <span className="min-w-0 truncate">{truncate(progress.objective, 160)}</span>
                    </div>
                ) : null}
            </div>
        </div>
    )
}
