import { useEffect, useMemo, useRef, useState } from 'react'
import type { ToolGroupBlock } from '@/chat/toolGroups'
import type { ToolCallBlock } from '@/chat/types'
import { getCodexCommandActions, type CodexCommandAction } from '@/chat/codexCommandPresentation'
import type { SessionMetadataSummary } from '@/types/api'
import { useHappyChatContext } from '@/components/AssistantChat/context'
import { getToolTimingDetails, ToolDetailDialogContent, ToolStatusIcon, ToolTimingSummary, toolStatusColorClass } from '@/components/ToolCard/ToolCard'
import { getToolPresentation } from '@/components/ToolCard/knownTools'
import { formatGroupedHeaderTitle, getGroupedHeaderMeta, safeGroupedLabelValue } from '@/components/ToolCard/groupedPresentation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import { formatDuration } from '@/chat/presentation'

const TIMING_INTERVAL_MS = 1000

export function getToolGroupTiming(tools: ToolCallBlock[], now: number): {
    startedAt: number | null
    completedAt: number | null
    durationMs: number | null
    running: boolean
} {
    const startedValues = tools
        .filter((tool) => tool.tool.state !== 'pending')
        .map((tool) => tool.tool.startedAt ?? tool.tool.createdAt)
        .filter((value): value is number => Number.isFinite(value))
    const startedAt = startedValues.length > 0 ? Math.min(...startedValues) : null
    const running = tools.some((tool) => tool.tool.state === 'running')
    const allFinished = tools.length > 0 && tools.every((tool) => tool.tool.state === 'completed' || tool.tool.state === 'error')
    const completedValues = allFinished
        ? tools.map((tool) => tool.tool.completedAt).filter((value): value is number => value != null && Number.isFinite(value))
        : []
    const completedAt = allFinished && completedValues.length === tools.length ? Math.max(...completedValues) : null
    const durationEnd = running ? now : completedAt
    const durationMs = startedAt != null && durationEnd != null && durationEnd >= startedAt
        ? durationEnd - startedAt
        : null

    return { startedAt, completedAt, durationMs, running }
}

function DetailsIcon(props: { open: boolean }) {
    return (
        <svg className={cn('h-4 w-4 transition-transform duration-200', props.open ? 'rotate-90' : null)} viewBox="0 0 16 16" fill="none" data-state={props.open ? 'open' : 'closed'}>
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

function SummaryBadge(props: { className: string; text: string }) {
    return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', props.className)}>
            {props.text}
        </span>
    )
}

function RowStatusBadge(props: { block: ToolCallBlock }) {
    const { t } = useTranslation()
    if (props.block.tool.state === 'error') {
        return <SummaryBadge className="bg-red-500/10 text-red-600" text={t('toolGroup.rowStatus.error')} />
    }
    if (props.block.tool.state === 'running') {
        return <SummaryBadge className="bg-sky-500/10 text-sky-600" text={t('toolGroup.rowStatus.running')} />
    }
    if (props.block.tool.state === 'pending') {
        return <SummaryBadge className="bg-amber-500/10 text-amber-700" text={t('toolGroup.rowStatus.pending')} />
    }
    return null
}

function GroupStatusBadge(props: { block: ToolGroupBlock }) {
    const { t } = useTranslation()
    const { runningCount, pendingCount, errorCount } = props.block.summary

    let state: ToolCallBlock['tool']['state'] = 'completed'
    let text = t('toolGroup.status.completed')
    let className = 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)]'

    if (runningCount > 0) {
        state = 'running'
        text = t('toolGroup.status.running')
        className = 'bg-sky-500/10 text-sky-600'
    } else if (pendingCount > 0) {
        state = 'pending'
        text = t('toolGroup.status.pending')
        className = 'bg-amber-500/10 text-amber-700'
    } else if (errorCount > 0) {
        state = 'error'
        text = t('toolGroup.status.error', { n: errorCount })
        className = 'bg-red-500/10 text-red-600'
    }

    return (
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium', className)}>
            <ToolStatusIcon state={state} />
            <span>{text}</span>
        </span>
    )
}

function RowLabel(props: { block: ToolCallBlock; metadata: SessionMetadataSummary | null }) {
    const { t } = useTranslation()
    const presentation = useMemo(() => getToolPresentation({
        toolName: props.block.tool.name,
        input: props.block.tool.input,
        result: props.block.tool.result,
        childrenCount: props.block.children.length,
        description: props.block.tool.nativeTitle ?? props.block.tool.description,
        metadata: props.metadata
    }, t), [props.block, props.metadata, t])

    return (
        <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--app-tool-card-accent)] leading-none">
                    {presentation.icon}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="truncate whitespace-nowrap text-sm font-medium text-[var(--app-fg)]">
                        {presentation.title}
                    </div>
                    {presentation.subtitle ? (
                        <div className="truncate whitespace-nowrap font-mono text-xs text-[var(--app-tool-card-subtitle)]">
                            {presentation.subtitle}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

function basename(value: string): string {
    return value.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? value
}

function codexActionLabel(
    action: CodexCommandAction,
    t: (key: string, params?: Record<string, string | number>) => string
): { title: string; detail: string | null } {
    if (action.type === 'read') {
        const detail = safeGroupedLabelValue(action.name) ?? safeGroupedLabelValue(action.path)
        return { title: t('toolGroup.codex.read'), detail: detail ? basename(detail) : null }
    }
    if (action.type === 'listFiles') {
        return { title: t('toolGroup.codex.list'), detail: safeGroupedLabelValue(action.path) }
    }
    if (action.type === 'search') {
        const query = safeGroupedLabelValue(action.query)
        const path = safeGroupedLabelValue(action.path)
        return {
            title: t('toolGroup.codex.search'),
            detail: query && path
                ? t('toolGroup.codex.searchIn', { query, path })
                : query ?? path
        }
    }
    return { title: t('toolGroup.friendly.genericCommand'), detail: null }
}

function CodexExplorationRows(props: {
    tools: ToolCallBlock[]
    onSelect: (toolId: string) => void
}) {
    const { t } = useTranslation()
    return props.tools.flatMap((tool) => (
        getCodexCommandActions(tool).map((action, index) => {
            const label = codexActionLabel(action, t)
            return (
                <button
                    key={`${tool.id}:${index}`}
                    type="button"
                    className="flex min-w-0 items-start gap-2 rounded-lg px-2 py-1 text-left hover:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]"
                    onClick={() => props.onSelect(tool.id)}
                >
                    <span className="mt-1 text-xs text-[var(--app-hint)]">└</span>
                    <span className="shrink-0 text-sm font-medium text-[var(--app-tool-card-accent)]">
                        {label.title}
                    </span>
                    {label.detail ? (
                        <span className="min-w-0 truncate text-sm text-[var(--app-fg)]">
                            {label.detail}
                        </span>
                    ) : null}
                </button>
            )
        })
    ))
}

export function ToolGroupCard(props: {
    block: ToolGroupBlock
    metadata: SessionMetadataSummary | null
}) {
    const { t, locale } = useTranslation()
    const ctx = useHappyChatContext()
    const [open, setOpen] = useState(props.block.defaultOpen)
    const [selectedToolId, setSelectedToolId] = useState<string | null>(null)
    const [isHydratingHistory, setIsHydratingHistory] = useState(false)
    const [historyExhausted, setHistoryExhausted] = useState(false)
    const [now, setNow] = useState(() => Date.now())
    const hydrationRunRef = useRef(0)
    const groupTiming = getToolGroupTiming(props.block.tools, now)

    useEffect(() => {
        if (!groupTiming.running) return
        setNow(Date.now())
        const id = setInterval(() => setNow(Date.now()), TIMING_INTERVAL_MS)
        return () => clearInterval(id)
    }, [groupTiming.running, groupTiming.startedAt])

    useEffect(() => {
        hydrationRunRef.current += 1
        setOpen(props.block.defaultOpen)
        setSelectedToolId(null)
        setIsHydratingHistory(false)
        setHistoryExhausted(false)
    }, [props.block.id, props.block.defaultOpen])

    useEffect(() => {
        if (!open) {
            hydrationRunRef.current += 1
            setIsHydratingHistory(false)
            setHistoryExhausted(false)
            return
        }
        if (!props.block.needsOlderHistory) {
            hydrationRunRef.current += 1
            setIsHydratingHistory(false)
            setHistoryExhausted(false)
            return
        }
        if (isHydratingHistory || historyExhausted) {
            return
        }
        if (ctx.isSyncingTail || ctx.isLoadingMoreMessages) {
            return
        }
        if (!ctx.hasMoreMessages) {
            hydrationRunRef.current += 1
            setIsHydratingHistory(false)
            setHistoryExhausted(true)
            return
        }

        const runId = hydrationRunRef.current + 1
        hydrationRunRef.current = runId
        setHistoryExhausted(false)
        setIsHydratingHistory(true)
        void ctx.loadOlderMessagesPreservingScroll()
            .then((result) => {
                if (hydrationRunRef.current !== runId) return
                setIsHydratingHistory(false)
                if (result === 'terminal-stop') {
                    setHistoryExhausted(true)
                }
            })
            .catch(() => {
                if (hydrationRunRef.current !== runId) return
                setIsHydratingHistory(false)
                setHistoryExhausted(true)
            })
    }, [
        open,
        props.block.needsOlderHistory,
        ctx.hasMoreMessages,
        ctx.isSyncingTail,
        ctx.isLoadingMoreMessages,
        ctx.loadOlderMessagesPreservingScroll,
        historyExhausted,
        isHydratingHistory,
    ])

    const selectedTool = useMemo(
        () => props.block.tools.find((tool) => tool.id === selectedToolId) ?? null,
        [props.block.tools, selectedToolId]
    )
    const selectedPresentation = useMemo(() => {
        if (!selectedTool) return null
        return getToolPresentation({
            toolName: selectedTool.tool.name,
            input: selectedTool.tool.input,
            result: selectedTool.tool.result,
            childrenCount: selectedTool.children.length,
            description: selectedTool.tool.nativeTitle ?? selectedTool.tool.description,
            metadata: props.metadata
        }, t)
    }, [selectedTool, props.metadata, t])

    const primaryTitle = formatGroupedHeaderTitle(props.block, t, locale)
    const meta = props.block.presentationMode === 'codex-exploration'
        ? null
        : getGroupedHeaderMeta(props.block, t, props.metadata)

    return (
        <Card className="overflow-hidden rounded-[20px] bg-[var(--app-tool-group-bg)] shadow-none">
            <CardHeader className="space-y-0 p-3 pb-2 transition-colors hover:bg-[var(--app-tool-card-hover-bg)]">
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]"
                    aria-expanded={open}
                >
                    <div className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
                        <div className="flex h-3.5 w-3.5 items-center justify-center text-[var(--app-tool-card-accent)] leading-none">
                            <DetailsIcon open={open} />
                        </div>
                        <CardTitle className="min-w-0 truncate whitespace-nowrap text-sm font-medium leading-tight text-[var(--app-fg)]">
                            {primaryTitle}
                        </CardTitle>
                        <div className="flex shrink-0 items-center text-[var(--app-hint)]">
                            <GroupStatusBadge block={props.block} />
                        </div>
                        {props.block.activitySummary ? (
                            <p className="col-span-2 col-start-2 line-clamp-2 text-sm leading-snug text-[var(--app-fg)] opacity-80">
                                {props.block.activitySummary}
                            </p>
                        ) : null}
                        {meta ? (
                            <CardDescription className="col-span-2 col-start-2 flex min-w-0 items-center gap-1 text-xs text-[var(--app-tool-card-subtitle)]">
                                {meta.location ? (
                                    <>
                                        <span className="min-w-0 truncate whitespace-nowrap">{meta.location}</span>
                                        <span className="shrink-0" aria-hidden="true">·</span>
                                    </>
                                ) : null}
                                <span className="shrink-0 whitespace-nowrap">{meta.steps}</span>
                            </CardDescription>
                        ) : null}
                        <div className="col-span-2 col-start-2">
                            <ToolTimingSummary
                                startedAt={groupTiming.startedAt}
                                completedAt={groupTiming.completedAt}
                                durationMs={groupTiming.durationMs}
                                typography="group"
                            />
                        </div>
                    </div>
                </button>
            </CardHeader>

            {open ? (
                <CardContent className="px-3 pb-3 pt-1">
                    {props.block.activitySummary ? (
                        <div className="mb-2 rounded-xl border border-sky-500/15 bg-sky-500/5 px-3 py-2">
                            <div className="mb-1 text-xs font-medium text-[var(--app-hint)]">
                                {t('toolGroup.reasoningSummary')}
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--app-fg)]">
                                {props.block.activitySummary}
                            </p>
                        </div>
                    ) : null}
                    <div className="flex flex-col gap-2">
                        {props.block.presentationMode === 'codex-exploration' ? (
                            <CodexExplorationRows tools={props.block.tools} onSelect={setSelectedToolId} />
                        ) : props.block.tools.map((tool) => {
                            const timing = getToolTimingDetails(tool.tool, now)
                            return (
                                <button
                                    key={tool.id}
                                    type="button"
                                    className="flex items-center gap-3 rounded-[16px] border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-left transition-colors hover:bg-[var(--app-subtle-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]"
                                    onClick={() => setSelectedToolId(tool.id)}
                                >
                                    <span className={cn('shrink-0', toolStatusColorClass(tool.tool.state))}>
                                        <ToolStatusIcon state={tool.tool.state} />
                                    </span>
                                    <RowLabel block={tool} metadata={props.metadata} />
                                    <div className="flex shrink-0 items-center gap-2">
                                        {timing.durationMs != null ? (
                                            <span className="font-mono text-xs text-[var(--app-hint)]">
                                                {formatDuration(timing.durationMs)}
                                            </span>
                                        ) : null}
                                        <RowStatusBadge block={tool} />
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    {isHydratingHistory ? (
                        <div className="mt-3 text-xs text-[var(--app-hint)]">
                            {t('toolGroup.loadingOlderHistory')}
                        </div>
                    ) : null}
                    {!isHydratingHistory && historyExhausted && props.block.needsOlderHistory ? (
                        <div className="mt-3 text-xs text-[var(--app-hint)]">
                            {t('toolGroup.historyUnavailable')}
                        </div>
                    ) : null}
                </CardContent>
            ) : null}

            <Dialog open={selectedTool !== null} onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    setSelectedToolId(null)
                }
            }}>
                <DialogContent className="max-w-2xl" closeButtonClassName="top-2" aria-describedby={undefined}>
                    {selectedTool && selectedPresentation ? (
                        <>
                            <DialogHeader className="text-left">
                                <DialogTitle>{selectedPresentation.title}</DialogTitle>
                            </DialogHeader>
                            <ToolDetailDialogContent block={selectedTool} metadata={props.metadata} />
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </Card>
    )
}
