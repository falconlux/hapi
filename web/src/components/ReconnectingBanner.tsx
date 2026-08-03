import { useTranslation } from '@/lib/use-translation'

function getReasonLabel(reason: string, t: (key: string) => string): string {
    if (reason === 'heartbeat-timeout') {
        return t('reconnecting.reason.heartbeatTimeout')
    }
    if (reason === 'visibility-recovery') {
        return t('reconnecting.reason.visibilityRecovery')
    }
    if (reason === 'closed') {
        return t('reconnecting.reason.closed')
    }
    if (reason === 'error') {
        return t('reconnecting.reason.error')
    }
    return reason
}

export function ReconnectingBanner({
    isReconnecting,
    reason,
    onRestore
}: {
    isReconnecting: boolean
    reason?: string | null
    onRestore: () => void
}) {
    const { t } = useTranslation()
    const reasonLabel = reason ? getReasonLabel(reason, t) : null

    if (!isReconnecting) {
        return null
    }

    return (
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-white text-center pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] px-3 text-sm font-medium z-50 flex items-center justify-center gap-3">
            <span className="flex min-w-0 items-center justify-center gap-2">
                <span className="shrink-0 animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                <span>{t('reconnecting.message')}</span>
                {reasonLabel ? <span className="truncate opacity-90">({reasonLabel})</span> : null}
            </span>
            <button
                type="button"
                onClick={onRestore}
                className="shrink-0 rounded-md border border-white/70 bg-white/15 px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-white/25 active:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
                {t('offline.restore')}
            </button>
        </div>
    )
}
