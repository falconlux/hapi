import { useCallback, useState } from 'react'
import { ApiClient } from '@/api/client'
import { Spinner } from '@/components/Spinner'
import { useTranslation } from '@/lib/use-translation'

type Props = {
    baseUrl: string
    accessToken: string
    currentPassword: string
    force?: boolean
    onSuccess: (newToken: string, newPassword: string) => void
    onCancel?: () => void
}

export function ChangePasswordModal({ baseUrl, accessToken, currentPassword, force, onSuccess, onCancel }: Props) {
    const { t } = useTranslation()
    const [current, setCurrent] = useState(currentPassword || '')
    const [next, setNext] = useState('')
    const [confirm, setConfirm] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const submit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        if (next.length < 6) {
            setError(t('login.changePassword.tooShort'))
            return
        }
        if (next !== confirm) {
            setError(t('login.changePassword.mismatch'))
            return
        }
        if (next === current) {
            setError(t('login.changePassword.sameAsCurrent'))
            return
        }
        setIsSubmitting(true)
        try {
            const client = new ApiClient('', { baseUrl })
            const result = await client.changePassword({
                accessToken,
                currentPassword: current,
                newPassword: next
            })
            onSuccess(result.token, next)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed')
        } finally {
            setIsSubmitting(false)
        }
    }, [accessToken, baseUrl, confirm, current, next, onSuccess, t])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-[var(--app-bg-elevated,var(--app-bg))] p-6 shadow-xl space-y-4">
                <div>
                    <div className="text-lg font-semibold">{t('login.changePassword.title')}</div>
                    <div className="text-sm text-[var(--app-hint)]">{t('login.changePassword.description')}</div>
                </div>
                <form onSubmit={submit} className="space-y-3">
                    <input
                        type="password"
                        value={current}
                        onChange={(e) => setCurrent(e.target.value)}
                        placeholder={t('login.changePassword.current')}
                        autoComplete="current-password"
                        disabled={isSubmitting}
                        className="w-full px-3 py-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] disabled:opacity-50"
                    />
                    <input
                        type="password"
                        value={next}
                        onChange={(e) => setNext(e.target.value)}
                        placeholder={t('login.changePassword.new')}
                        autoComplete="new-password"
                        disabled={isSubmitting}
                        className="w-full px-3 py-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] disabled:opacity-50"
                    />
                    <input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder={t('login.changePassword.confirm')}
                        autoComplete="new-password"
                        disabled={isSubmitting}
                        className="w-full px-3 py-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--app-button)] disabled:opacity-50"
                    />
                    {error && <div className="text-sm text-red-500">{error}</div>}
                    <div className="flex items-center justify-end gap-2">
                        {!force && onCancel && (
                            <button
                                type="button"
                                onClick={onCancel}
                                disabled={isSubmitting}
                                className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-[var(--app-fg)]"
                            >
                                Cancel
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--app-button)] text-[var(--app-button-text)] font-medium disabled:opacity-50"
                        >
                            {isSubmitting && <Spinner size="sm" label={null} className="text-[var(--app-button-text)]" />}
                            {isSubmitting ? t('login.changePassword.submitting') : t('login.changePassword.submit')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
