import { PROTOCOL_VERSION } from '@hapi/protocol'
import { useState } from 'react'
import { useTranslation } from '@/lib/use-translation'
import { clearAppCacheAndReload } from '@/lib/appCache'
import { SettingsPageContent, SettingsRow, SettingsSection } from '@/components/settings/SettingsPrimitives'

export default function SettingsAboutPage() {
    const { t } = useTranslation()
    const [cacheState, setCacheState] = useState<'idle' | 'clearing' | 'error'>('idle')

    const clearCache = async () => {
        if (cacheState === 'clearing') {
            return
        }
        setCacheState('clearing')
        try {
            await clearAppCacheAndReload()
        } catch {
            setCacheState('error')
        }
    }

    return (
        <SettingsPageContent title={t('settings.about.title')} description={t('settings.about.description')}>
            <SettingsSection>
                <SettingsRow label={t('settings.about.website')} trailing={
                    <a href="https://hapi.run" target="_blank" rel="noopener noreferrer" className="text-[var(--app-link)] hover:underline">hapi.run</a>
                } />
                <SettingsRow label={t('settings.about.appVersion')} trailing={<span className="text-[var(--app-hint)]">{__APP_VERSION__}</span>} />
                <SettingsRow label={t('settings.about.protocolVersion')} trailing={<span className="text-[var(--app-hint)]">{PROTOCOL_VERSION}</span>} />
            </SettingsSection>
            <SettingsSection title={t('settings.about.maintenance')}>
                <SettingsRow label={t('settings.about.cache')} description={t('settings.about.cacheDescription')} trailing={
                    <button
                        type="button"
                        onClick={() => void clearCache()}
                        disabled={cacheState === 'clearing'}
                        aria-busy={cacheState === 'clearing'}
                        className="whitespace-nowrap rounded-lg bg-[var(--app-button)] px-3 py-2 text-sm font-medium text-[var(--app-button-text)] transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
                    >
                        {cacheState === 'clearing' ? t('settings.about.clearingCache') : t('settings.about.clearCache')}
                    </button>
                }>
                    {cacheState === 'error' ? <div role="alert" className="mt-1 text-xs text-red-500">{t('settings.about.cacheClearFailed')}</div> : null}
                </SettingsRow>
            </SettingsSection>
        </SettingsPageContent>
    )
}
