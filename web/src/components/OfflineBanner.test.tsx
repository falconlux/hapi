import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { OfflineBanner } from './OfflineBanner'

const useOnlineStatusMock = vi.fn(() => true)

vi.mock('@/hooks/useOnlineStatus', () => ({
    useOnlineStatus: () => useOnlineStatusMock()
}))

describe('OfflineBanner', () => {
    beforeEach(() => {
        useOnlineStatusMock.mockReturnValue(true)
    })

    it('shows when the browser and hub are offline', () => {
        useOnlineStatusMock.mockReturnValue(false)
        const onRestore = vi.fn()

        render(<I18nProvider><OfflineBanner isHubConnected={false} isReconnecting={false} onRestore={onRestore} /></I18nProvider>)

        expect(screen.getByText(/currently offline/i)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /restore/i }))
        expect(onRestore).toHaveBeenCalledOnce()
    })

    it('ignores navigator.onLine when the hub is connected', () => {
        useOnlineStatusMock.mockReturnValue(false)

        render(<I18nProvider><OfflineBanner isHubConnected={true} isReconnecting={false} onRestore={() => {}} /></I18nProvider>)

        expect(screen.queryByText(/currently offline/i)).toBeNull()
    })

    it('defers to the reconnecting banner during an SSE outage', () => {
        useOnlineStatusMock.mockReturnValue(false)

        render(<I18nProvider><OfflineBanner isHubConnected={false} isReconnecting={true} onRestore={() => {}} /></I18nProvider>)

        expect(screen.queryByText(/currently offline/i)).toBeNull()
    })
})
