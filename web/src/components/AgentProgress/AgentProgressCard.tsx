import { useMemo, useState } from 'react'
import type { ChatBlock, ToolCallBlock } from '@/chat/types'
import { deriveAgentProgress } from '@/components/AgentProgress/agentProgress'
import { getToolGroupActionKind } from '@/chat/toolGroups'
import { getToolPresentation } from '@/components/ToolCard/knownTools'
import type { SessionMetadataSummary } from '@/types/api'
import { getInputStringAny, truncate } from '@/lib/toolInputUtils'
import { localizeCodexActivityTitle } from '@/lib/codexActivityTitle'
import { useTranslation } from '@/lib/use-translation'

type Translator = (key: string, params?: Record<string, string | number>) => string

const COLLAPSED_STORAGE_KEY = 'hapi-agent-progress-collapsed'

function readCollapsedPreference(): boolean {
    try {
        return globalThis.localStorage?.getItem(COLLAPSED_STORAGE_KEY) === '1'
    } catch {
        return false
    }
}

function storeCollapsedPreference(collapsed: boolean): void {
    try {
        globalThis.localStorage?.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
        // Ignore storage restrictions; the in-memory toggle still works.
    }
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
    const [collapsed, setCollapsed] = useState(readCollapsedPreference)
    const progress = useMemo(
        () => deriveAgentProgress(props.blocks, props.fallbackObjective),
        [props.blocks, props.fallbackObjective],
    )

    if (!props.isRunning) return null

    const primaryProgress = progress.progressMessage ?? progress.phase ?? t('agentProgress.preparing')
    const localizedPrimary = localizeCodexActivityTitle(primaryProgress, locale)
    const localizedPhase = progress.phase ? localizeCodexActivityTitle(progress.phase, locale) : null
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
    const toggleCollapsed = () => {
        setCollapsed((current) => {
            const next = !current
            storeCollapsedPreference(next)
            return next
        })
    }

    return (
        <div className="px-3 pb-2" aria-live="polite" data-testid="agent-progress-card">
            <div className={`mx-auto w-full max-w-content rounded-2xl border border-sky-500/25 bg-sky-500/5 px-3 shadow-sm ${collapsed ? 'py-1.5' : 'py-2.5'}`}>
                <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-sky-700 dark:text-sky-300">
                        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500" aria-hidden="true" />
                        <span className="truncate">{t('agentProgress.running')}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[11px] text-[var(--app-hint)]">{progressLabel}</span>
                        <button
                            type="button"
                            onClick={toggleCollapsed}
                            aria-expanded={!collapsed}
                            aria-label={t(collapsed ? 'agentProgress.expand' : 'agentProgress.collapse')}
                            title={t(collapsed ? 'agentProgress.expand' : 'agentProgress.collapse')}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-sky-500/10 hover:text-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-180'}`}
                                aria-hidden="true"
                            >
                                <path d="m6 9 6 6 6-6" />
                            </svg>
                        </button>
                    </div>
                </div>

                {!collapsed ? (
                    <>
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
                    </>
                ) : null}
            </div>
        </div>
    )
}
