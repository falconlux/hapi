import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CacheMaintenanceAction } from './HappyComposer'

const clearAppCacheAndReload = vi.hoisted(() => vi.fn())

vi.mock('@/lib/appCache', () => ({ clearAppCacheAndReload }))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'settings.about.maintenance': 'Maintenance',
            'settings.about.clearCache': 'Clear cache & reload',
            'settings.about.clearingCache': 'Clearing…',
            'settings.about.cacheClearFailed': 'Could not clear the cache. Please try again.',
        }[key] ?? key),
    }),
}))

describe('CacheMaintenanceAction', () => {
    beforeEach(() => {
        clearAppCacheAndReload.mockReset()
        clearAppCacheAndReload.mockResolvedValue(undefined)
    })

    it('clears the app cache from the composer settings panel', async () => {
        render(<CacheMaintenanceAction />)

        fireEvent.click(screen.getByRole('button', { name: 'Clear cache & reload' }))

        await waitFor(() => expect(clearAppCacheAndReload).toHaveBeenCalledOnce())
    })

    it('shows a retryable error when clearing fails', async () => {
        clearAppCacheAndReload.mockRejectedValueOnce(new Error('failed'))
        render(<CacheMaintenanceAction />)

        fireEvent.click(screen.getByRole('button', { name: 'Clear cache & reload' }))

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not clear the cache. Please try again.')
        expect(screen.getByRole('button', { name: 'Clear cache & reload' })).toBeEnabled()
    })
})
