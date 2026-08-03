import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useTranslation } from '@/lib/use-translation'

export function OfflineBanner({
    isHubConnected,
    isReconnecting,
    onRestore
}: {
    isHubConnected: boolean
    isReconnecting: boolean
    onRestore: () => void
}) {
    const { t } = useTranslation()
    const isOnline = useOnlineStatus()

    if (isOnline || isHubConnected || isReconnecting) {
        return null
    }

    return (
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-white text-center pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] px-3 text-sm font-medium z-50 flex items-center justify-center gap-3">
            <span>{t('offline.message')}</span>
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
