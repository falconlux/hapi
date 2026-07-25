import { useEffect, useMemo, useRef, useState } from 'react'
import type { ToolGroupBlock } from '@/chat/toolGroups'
import type { ToolCallBlock } from '@/chat/types'
import type { SessionMetadataSummary } from '@/types/api'
import { useHappyChatContext } from '@/components/AssistantChat/context'
import { ToolDetailDialogContent, ToolStatusIcon, toolStatusColorClass } from '@/components/ToolCard/ToolCard'
import { getToolPresentation } from '@/components/ToolCard/knownTools'
import { formatGroupedHeaderTitle, getGroupedHeaderMeta } from '@/components/ToolCard/groupedPresentation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'

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

export function ToolGroupCard(props: {
    block: ToolGroupBlock
    metadata: SessionMetadataSummary | null
}) {
    const { t } = useTranslation()
    const ctx = useHappyChatContext()
    const [open, setOpen] = useState(props.block.defaultOpen)
    const [selectedToolId, setSelectedToolId] = useState<string | null>(null)
    const [isHydratingHistory, setIsHydratingHistory] = useState(false)
    const [historyExhausted, setHistoryExhausted] = useState(false)
    const [retryNonce, setRetryNonce] = useState(0)
    const hydrationRunRef = useRef(0)
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    function clearRetryTimer() {
        if (retryTimerRef.current === null) {
            return
        }
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
    }

    useEffect(() => {
        clearRetryTimer()
        hydrationRunRef.current += 1
        setOpen(props.block.defaultOpen)
        setSelectedToolId(null)
        setIsHydratingHistory(false)
        setHistoryExhausted(false)
    }, [props.block.id, props.block.defaultOpen])

    useEffect(() => {
        return () => {
            clearRetryTimer()
        }
    }, [])

    useEffect(() => {
        if (!open) {
            clearRetryTimer()
            hydrationRunRef.current += 1
            setIsHydratingHistory(false)
            setHistoryExhausted(false)
            return
        }
        if (!props.block.needsOlderHistory) {
            clearRetryTimer()
            hydrationRunRef.current += 1
            setIsHydratingHistory(false)
            setHistoryExhausted(false)
            return
        }
        if (isHydratingHistory || historyExhausted) {
            return
        }
        if (ctx.isLoadingMoreMessages) {
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
            .then((loaded) => {
                if (hydrationRunRef.current !== runId) return
                setIsHydratingHistory(false)
                if (!loaded) {
                    if (!ctx.hasMoreMessages) {
                        setHistoryExhausted(true)
                        return
                    }
                    clearRetryTimer()
                    retryTimerRef.current = setTimeout(() => {
                        retryTimerRef.current = null
                        if (hydrationRunRef.current !== runId) return
                        setRetryNonce((value) => value + 1)
                    }, 150)
                }
            })
            .catch(() => {
                if (hydrationRunRef.current !== runId) return
                clearRetryTimer()
                setIsHydratingHistory(false)
                setHistoryExhausted(true)
            })
    }, [
        open,
        props.block.needsOlderHistory,
        ctx.hasMoreMessages,
        ctx.isLoadingMoreMessages,
        ctx.loadOlderMessagesPreservingScroll,
        historyExhausted,
        isHydratingHistory,
        retryNonce,
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

    const primaryTitle = formatGroupedHeaderTitle(props.block, t)
    const meta = getGroupedHeaderMeta(props.block, t, props.metadata)

    return (
        <Card className="overflow-hidden rounded-[16px] bg-[var(--app-tool-group-bg)] shadow-none">
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
                        <CardDescription className="col-span-2 col-start-2 flex min-w-0 items-center gap-1 text-xs text-[var(--app-tool-card-subtitle)]">
                            {meta.location ? (
                                <>
                                    <span className="min-w-0 truncate whitespace-nowrap">{meta.location}</span>
                                    <span className="shrink-0" aria-hidden="true">·</span>
                                </>
                            ) : null}
                            <span className="shrink-0 whitespace-nowrap">{meta.steps}</span>
                        </CardDescription>
                    </div>
                </button>
            </CardHeader>

            {open ? (
                <CardContent className="px-3 pb-3 pt-1">
                    <div className="flex flex-col gap-2">
                        {props.block.tools.map((tool) => {
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
                <DialogContent className="max-w-2xl" aria-describedby={undefined}>
                    {selectedTool && selectedPresentation ? (
                        <>
                            <DialogHeader>
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
