import { useState, useRef, useEffect } from 'react'
import { useTranslation, type Locale } from '@/lib/use-translation'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useAppContext } from '@/lib/app-context'
import { getElevenLabsSupportedLanguages, getLanguageDisplayName, type Language } from '@/lib/languages'
import { getFontScaleOptions, useFontScale, type FontScale } from '@/hooks/useFontScale'
import { getTerminalFontSizeOptions, useTerminalFontSize, type TerminalFontSize } from '@/hooks/useTerminalFontSize'
import { getComposerEnterBehaviorOptions, useComposerEnterBehavior, type ComposerEnterBehavior } from '@/hooks/useComposerEnterBehavior'
import { useAppearance, getAppearanceOptions, type AppearancePreference } from '@/hooks/useTheme'
import { PROTOCOL_VERSION } from '@hapi/protocol'
import type { UsageResponse, CswapAccount } from '@/types/api'

const locales: { value: Locale; nativeLabel: string }[] = [
    { value: 'en', nativeLabel: 'English' },
    { value: 'zh-CN', nativeLabel: '简体中文' },
]

const voiceLanguages = getElevenLabsSupportedLanguages()

function BackIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="15 18 9 12 15 6" />
        </svg>
    )
}

function CheckIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    )
}

function ChevronDownIcon(props: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <polyline points="6 9 12 15 18 9" />
        </svg>
    )
}

function formatResetTime(isoString: string): string {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    if (diffMs <= 0) return 'now'
    const hours = Math.floor(diffMs / 3_600_000)
    const minutes = Math.floor((diffMs % 3_600_000) / 60_000)
    if (hours > 24) {
        const days = Math.floor(hours / 24)
        return `${days}d ${hours % 24}h`
    }
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
}

function pctColor(pct: number | null): string {
    if (pct === null) return 'var(--app-secondary-bg)'
    if (pct >= 85) return 'var(--app-error, #ef4444)'
    if (pct >= 60) return 'var(--app-warning, #f59e0b)'
    return 'var(--app-success, #22c55e)'
}

function MiniBar({ label, pct, resets }: { label: string; pct: number | null; resets: string | null }) {
    const value = pct ?? 0
    const w = Math.min(100, Math.max(0, value))
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[var(--app-fg)] text-xs font-medium">{label}</span>
                <span className="text-[var(--app-hint)] text-xs tabular-nums">
                    {pct === null ? '—' : `${pct}%`}
                    {resets ? <span className="ml-1 opacity-60">· {resets}</span> : null}
                </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--app-secondary-bg)] overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${w}%`, backgroundColor: pctColor(pct) }}
                />
            </div>
        </div>
    )
}

function AccountCard({ acc, onSwitch, switching }: { acc: CswapAccount; onSwitch?: (idx: number) => void; switching?: boolean }) {
    const isOverLimit = (acc.fiveHourPct ?? 0) >= 85
    const localPart = acc.email.split('@')[0]
    const shortName = localPart.length > 16 ? `${localPart.slice(0, 14)}…` : localPart

    return (
        <div
            className={`rounded-xl border p-3 transition-colors ${
                acc.isActive
                    ? 'border-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                    : 'border-[var(--app-divider)] bg-transparent'
            }`}
        >
            <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                    <span
                        aria-hidden
                        className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                            acc.isActive ? 'bg-[var(--app-link)]' : 'bg-[var(--app-hint)] opacity-40'
                        }`}
                    />
                    <span className="text-[var(--app-fg)] text-sm font-semibold tabular-nums">
                        #{acc.idx}
                    </span>
                    <span className="text-[var(--app-fg)] text-sm truncate" title={acc.email}>
                        {shortName}
                    </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {isOverLimit && (
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--app-error,#ef4444)]">
                            OVER
                        </span>
                    )}
                    {!acc.isActive && onSwitch && (
                        <button
                            onClick={() => onSwitch(acc.idx)}
                            disabled={switching}
                            className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--app-link)] text-[var(--app-link)] hover:bg-[var(--app-link)] hover:text-white transition-colors disabled:opacity-50"
                        >
                            {switching ? '切换中…' : '切换'}
                        </button>
                    )}
                </div>
            </div>
            <div className="space-y-2">
                <MiniBar label="5h" pct={acc.fiveHourPct} resets={acc.fiveHourResets} />
                <MiniBar label="7d" pct={acc.sevenDayPct} resets={acc.sevenDayResets} />
            </div>
        </div>
    )
}

function UsageBar({ label, utilization, resetsAt, t }: {
    label: string
    utilization: number
    resetsAt: string
    t: (key: string) => string
}) {
    const pct = Math.min(100, Math.max(0, utilization))
    const color = pct >= 80 ? 'var(--app-error, #ef4444)' : pct >= 50 ? 'var(--app-warning, #f59e0b)' : 'var(--app-success, #22c55e)'
    return (
        <div className="py-1">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[var(--app-fg)] text-sm">{label}</span>
                <span className="text-[var(--app-hint)] text-xs">{pct}% · {t('settings.usage.resetsIn')} {formatResetTime(resetsAt)}</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--app-secondary-bg)] overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                />
            </div>
        </div>
    )
}

export default function SettingsPage() {
    const { t, locale, setLocale } = useTranslation()
    const goBack = useAppGoBack()
    const { signOut } = useAppContext()
    const [isOpen, setIsOpen] = useState(false)
    const [isAppearanceOpen, setIsAppearanceOpen] = useState(false)
    const [isFontOpen, setIsFontOpen] = useState(false)
    const [isTerminalFontOpen, setIsTerminalFontOpen] = useState(false)
    const [isChatOpen, setIsChatOpen] = useState(false)
    const [isVoiceOpen, setIsVoiceOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const appearanceContainerRef = useRef<HTMLDivElement>(null)
    const fontContainerRef = useRef<HTMLDivElement>(null)
    const terminalFontContainerRef = useRef<HTMLDivElement>(null)
    const chatContainerRef = useRef<HTMLDivElement>(null)
    const voiceContainerRef = useRef<HTMLDivElement>(null)
    const { fontScale, setFontScale } = useFontScale()
    const { terminalFontSize, setTerminalFontSize } = useTerminalFontSize()
    const { composerEnterBehavior, setComposerEnterBehavior } = useComposerEnterBehavior()
    const { appearance, setAppearance } = useAppearance()
    const { api } = useAppContext()
    const [usage, setUsage] = useState<UsageResponse | null>(null)
    const [usageLoading, setUsageLoading] = useState(true)
    const [cswapAccounts, setCswapAccounts] = useState<CswapAccount[]>([])
    const [switchingIdx, setSwitchingIdx] = useState<number | null>(null)

    useEffect(() => {
        if (!api) return
        api.getUsage()
            .then(setUsage)
            .catch(() => setUsage(null))
            .finally(() => setUsageLoading(false))
        api.getCswapAccounts()
            .then(r => setCswapAccounts(r.accounts ?? []))
            .catch(() => setCswapAccounts([]))
    }, [api])

    // Voice language state - read from localStorage
    const [voiceLanguage, setVoiceLanguage] = useState<string | null>(() => {
        return localStorage.getItem('hapi-voice-lang')
    })

    const fontScaleOptions = getFontScaleOptions()
    const terminalFontSizeOptions = getTerminalFontSizeOptions()
    const composerEnterBehaviorOptions = getComposerEnterBehaviorOptions()
    const appearanceOptions = getAppearanceOptions()
    const currentLocale = locales.find((loc) => loc.value === locale)
    const currentAppearanceLabel = appearanceOptions.find((opt) => opt.value === appearance)?.labelKey ?? 'settings.display.appearance.system'
    const currentFontScaleLabel = fontScaleOptions.find((opt) => opt.value === fontScale)?.label ?? '100%'
    const currentTerminalFontSizeLabel = terminalFontSizeOptions.find((opt) => opt.value === terminalFontSize)?.label ?? '13px'
    const currentComposerEnterBehaviorLabel = composerEnterBehaviorOptions.find((opt) => opt.value === composerEnterBehavior)?.labelKey ?? 'settings.chat.enterBehavior.send'
    const currentVoiceLanguage = voiceLanguages.find((lang) => lang.code === voiceLanguage)

    const handleLocaleChange = (newLocale: Locale) => {
        setLocale(newLocale)
        setIsOpen(false)
    }

    const handleAppearanceChange = (pref: AppearancePreference) => {
        setAppearance(pref)
        setIsAppearanceOpen(false)
    }

    const handleFontScaleChange = (newScale: FontScale) => {
        setFontScale(newScale)
        setIsFontOpen(false)
    }

    const handleTerminalFontSizeChange = (newSize: TerminalFontSize) => {
        setTerminalFontSize(newSize)
        setIsTerminalFontOpen(false)
    }

    const handleComposerEnterBehaviorChange = (newBehavior: ComposerEnterBehavior) => {
        setComposerEnterBehavior(newBehavior)
        setIsChatOpen(false)
    }

    const handleVoiceLanguageChange = (language: Language) => {
        setVoiceLanguage(language.code)
        if (language.code === null) {
            localStorage.removeItem('hapi-voice-lang')
        } else {
            localStorage.setItem('hapi-voice-lang', language.code)
        }
        setIsVoiceOpen(false)
    }

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!isOpen && !isAppearanceOpen && !isFontOpen && !isTerminalFontOpen && !isChatOpen && !isVoiceOpen) return

        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
            if (isAppearanceOpen && appearanceContainerRef.current && !appearanceContainerRef.current.contains(event.target as Node)) {
                setIsAppearanceOpen(false)
            }
            if (isFontOpen && fontContainerRef.current && !fontContainerRef.current.contains(event.target as Node)) {
                setIsFontOpen(false)
            }
            if (isTerminalFontOpen && terminalFontContainerRef.current && !terminalFontContainerRef.current.contains(event.target as Node)) {
                setIsTerminalFontOpen(false)
            }
            if (isChatOpen && chatContainerRef.current && !chatContainerRef.current.contains(event.target as Node)) {
                setIsChatOpen(false)
            }
            if (isVoiceOpen && voiceContainerRef.current && !voiceContainerRef.current.contains(event.target as Node)) {
                setIsVoiceOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen, isAppearanceOpen, isFontOpen, isTerminalFontOpen, isChatOpen, isVoiceOpen])

    // Close on escape key
    useEffect(() => {
        if (!isOpen && !isAppearanceOpen && !isFontOpen && !isTerminalFontOpen && !isChatOpen && !isVoiceOpen) return

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false)
                setIsAppearanceOpen(false)
                setIsFontOpen(false)
                setIsTerminalFontOpen(false)
                setIsChatOpen(false)
                setIsVoiceOpen(false)
            }
        }

        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, isAppearanceOpen, isFontOpen, isTerminalFontOpen, isChatOpen, isVoiceOpen])

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="bg-[var(--app-bg)] pt-[env(safe-area-inset-top)]">
                <div className="mx-auto w-full max-w-content flex items-center gap-2 p-3 border-b border-[var(--app-border)]">
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                    >
                        <BackIcon />
                    </button>
                    <div className="flex-1 font-semibold">{t('settings.title')}</div>
                </div>
            </div>

            <div className="app-scroll-y flex-1 min-h-0">
                <div className="mx-auto w-full max-w-content">
                    {/* Language section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.language.title')}
                        </div>
                        <div ref={containerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsOpen(!isOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.language.label')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{currentLocale?.nativeLabel}</span>
                                    <ChevronDownIcon className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[160px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.language.title')}
                                >
                                    {locales.map((loc) => {
                                        const isSelected = locale === loc.value
                                        return (
                                            <button
                                                key={loc.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleLocaleChange(loc.value)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{loc.nativeLabel}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Display section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.display.title')}
                        </div>
                        <div ref={appearanceContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsAppearanceOpen(!isAppearanceOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isAppearanceOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.display.appearance')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{t(currentAppearanceLabel)}</span>
                                    <ChevronDownIcon className={`transition-transform ${isAppearanceOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isAppearanceOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[160px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.display.appearance')}
                                >
                                    {appearanceOptions.map((opt) => {
                                        const isSelected = appearance === opt.value
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleAppearanceChange(opt.value)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{t(opt.labelKey)}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                        <div ref={fontContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsFontOpen(!isFontOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isFontOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.display.fontSize')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{currentFontScaleLabel}</span>
                                    <ChevronDownIcon className={`transition-transform ${isFontOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isFontOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[140px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.display.fontSize')}
                                >
                                    {fontScaleOptions.map((opt) => {
                                        const isSelected = fontScale === opt.value
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleFontScaleChange(opt.value)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{opt.label}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                        <div ref={terminalFontContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsTerminalFontOpen(!isTerminalFontOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isTerminalFontOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.display.terminalFontSize')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{currentTerminalFontSizeLabel}</span>
                                    <ChevronDownIcon className={`transition-transform ${isTerminalFontOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isTerminalFontOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[140px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.display.terminalFontSize')}
                                >
                                    {terminalFontSizeOptions.map((opt) => {
                                        const isSelected = terminalFontSize === opt.value
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleTerminalFontSizeChange(opt.value)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{opt.label}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Chat section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.chat.title')}
                        </div>
                        <div ref={chatContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsChatOpen(!isChatOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isChatOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.chat.enterBehavior')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>{t(currentComposerEnterBehaviorLabel)}</span>
                                    <ChevronDownIcon className={`transition-transform ${isChatOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isChatOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[170px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg overflow-hidden z-50"
                                    role="listbox"
                                    aria-label={t('settings.chat.enterBehavior')}
                                >
                                    {composerEnterBehaviorOptions.map((opt) => {
                                        const isSelected = composerEnterBehavior === opt.value
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleComposerEnterBehaviorChange(opt.value)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{t(opt.labelKey)}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Voice Assistant section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.voice.title')}
                        </div>
                        <div ref={voiceContainerRef} className="relative">
                            <button
                                type="button"
                                onClick={() => setIsVoiceOpen(!isVoiceOpen)}
                                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)]"
                                aria-expanded={isVoiceOpen}
                                aria-haspopup="listbox"
                            >
                                <span className="text-[var(--app-fg)]">{t('settings.voice.language')}</span>
                                <span className="flex items-center gap-1 text-[var(--app-hint)]">
                                    <span>
                                        {currentVoiceLanguage
                                            ? currentVoiceLanguage.code === null
                                                ? t('settings.voice.autoDetect')
                                                : getLanguageDisplayName(currentVoiceLanguage)
                                            : t('settings.voice.autoDetect')}
                                    </span>
                                    <ChevronDownIcon className={`transition-transform ${isVoiceOpen ? 'rotate-180' : ''}`} />
                                </span>
                            </button>

                            {isVoiceOpen && (
                                <div
                                    className="absolute right-3 top-full mt-1 min-w-[200px] max-h-[300px] overflow-y-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] shadow-lg z-50"
                                    role="listbox"
                                    aria-label={t('settings.voice.title')}
                                >
                                    {voiceLanguages.map((lang) => {
                                        const isSelected = voiceLanguage === lang.code
                                        const displayName = lang.code === null
                                            ? t('settings.voice.autoDetect')
                                            : getLanguageDisplayName(lang)
                                        return (
                                            <button
                                                key={lang.code ?? 'auto'}
                                                type="button"
                                                role="option"
                                                aria-selected={isSelected}
                                                onClick={() => handleVoiceLanguageChange(lang)}
                                                className={`flex items-center justify-between w-full px-3 py-2 text-base text-left transition-colors ${
                                                    isSelected
                                                        ? 'text-[var(--app-link)] bg-[var(--app-subtle-bg)]'
                                                        : 'text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
                                                }`}
                                            >
                                                <span>{displayName}</span>
                                                {isSelected && (
                                                    <span className="ml-2 text-[var(--app-link)]">
                                                        <CheckIcon />
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Usage section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.usage.title')}
                        </div>
                        {cswapAccounts.length > 0 && (
                            <div className="px-3 pt-2 pb-1 space-y-2">
                                {cswapAccounts.map(acc => (
                                    <AccountCard key={acc.idx} acc={acc} switching={switchingIdx === acc.idx} onSwitch={async (idx) => {
                                        if (!api || switchingIdx !== null) return
                                        setSwitchingIdx(idx)
                                        try {
                                            await api.switchCswapAccount(idx)
                                            const refreshed = await api.getCswapAccounts()
                                            setCswapAccounts(refreshed.accounts ?? [])
                                        } catch {}
                                        setSwitchingIdx(null)
                                    }} />
                                ))}
                            </div>
                        )}
                        {cswapAccounts.length === 0 && (
                            usageLoading ? (
                                <div className="px-3 py-3 text-[var(--app-hint)] text-sm">Loading...</div>
                            ) : usage ? (
                                <div className="px-3 py-2 space-y-3">
                                    {usage.subscriptionType && (
                                        <div className="flex items-center justify-between py-1">
                                            <span className="text-[var(--app-fg)] text-sm">{t('settings.usage.plan')}</span>
                                            <span className="text-[var(--app-hint)] text-sm capitalize">{usage.subscriptionType}</span>
                                        </div>
                                    )}
                                    {usage.five_hour && (
                                        <UsageBar
                                            label={t('settings.usage.fiveHour')}
                                            utilization={usage.five_hour.utilization}
                                            resetsAt={usage.five_hour.resets_at}
                                            t={t}
                                        />
                                    )}
                                    {usage.seven_day && (
                                        <UsageBar
                                            label={t('settings.usage.sevenDay')}
                                            utilization={usage.seven_day.utilization}
                                            resetsAt={usage.seven_day.resets_at}
                                            t={t}
                                        />
                                    )}
                                    {usage.seven_day_opus && (
                                        <UsageBar
                                            label={t('settings.usage.sevenDayOpus')}
                                            utilization={usage.seven_day_opus.utilization}
                                            resetsAt={usage.seven_day_opus.resets_at}
                                            t={t}
                                        />
                                    )}
                                    {usage.seven_day_sonnet && (
                                        <UsageBar
                                            label={t('settings.usage.sevenDaySonnet')}
                                            utilization={usage.seven_day_sonnet.utilization}
                                            resetsAt={usage.seven_day_sonnet.resets_at}
                                            t={t}
                                        />
                                    )}
                                </div>
                            ) : (
                                <div className="px-3 py-3 text-[var(--app-hint)] text-sm">{t('settings.usage.unavailable')}</div>
                            )
                        )}
                    </div>

                    {/* About section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.about.title')}
                        </div>
                        <div className="flex w-full items-center justify-between px-3 py-3">
                            <span className="text-[var(--app-fg)]">{t('settings.about.website')}</span>
                            <a
                                href="https://hapi.run"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--app-link)] hover:underline"
                            >
                                hapi.run
                            </a>
                        </div>
                        <div className="flex w-full items-center justify-between px-3 py-3">
                            <span className="text-[var(--app-fg)]">{t('settings.about.appVersion')}</span>
                            <span className="text-[var(--app-hint)]">{__APP_VERSION__}</span>
                        </div>
                        <div className="flex w-full items-center justify-between px-3 py-3">
                            <span className="text-[var(--app-fg)]">{t('settings.about.protocolVersion')}</span>
                            <span className="text-[var(--app-hint)]">{PROTOCOL_VERSION}</span>
                        </div>
                    </div>

                    {/* Cache section */}
                    <div className="border-b border-[var(--app-divider)]">
                        <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                            {t('settings.cache.title')}
                        </div>
                        <button
                            type="button"
                            onClick={async () => {
                                if (!window.confirm(t('settings.cache.clearConfirm'))) return
                                try {
                                    const regs = await navigator.serviceWorker?.getRegistrations()
                                    for (const reg of regs ?? []) await reg.unregister()
                                    const keys = await caches?.keys()
                                    for (const key of keys ?? []) await caches.delete(key)
                                    window.location.reload()
                                } catch {
                                    window.location.reload()
                                }
                            }}
                            className="flex w-full items-center px-3 py-3 text-left text-[var(--app-fg)] transition-colors hover:bg-[var(--app-subtle-bg)]"
                        >
                            {t('settings.cache.clear')}
                        </button>
                    </div>

                    {/* Sign Out section */}
                    {signOut && (
                        <div className="border-b border-[var(--app-divider)]">
                            <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
                                {t('settings.account.title')}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    if (window.confirm(t('settings.account.signOutConfirm'))) {
                                        signOut()
                                    }
                                }}
                                className="flex w-full items-center px-3 py-3 text-left text-red-500 transition-colors hover:bg-[var(--app-subtle-bg)]"
                            >
                                {t('settings.account.signOut')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
