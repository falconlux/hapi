import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { ReconnectingBanner } from './ReconnectingBanner'

describe('ReconnectingBanner', () => {
    it('shows whenever the hub SSE connection is reconnecting', () => {
        const onRestore = vi.fn()
        render(<I18nProvider><ReconnectingBanner isReconnecting reason="error" onRestore={onRestore} /></I18nProvider>)

        expect(screen.getByText(/reconnecting/i)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /restore/i }))
        expect(onRestore).toHaveBeenCalledOnce()
    })

    it('stays hidden while connected', () => {
        render(<I18nProvider><ReconnectingBanner isReconnecting={false} onRestore={() => {}} /></I18nProvider>)

        expect(screen.queryByText(/reconnecting/i)).toBeNull()
    })
})
