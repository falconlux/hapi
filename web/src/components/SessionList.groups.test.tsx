import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { ApiClient } from '@/api/client'
import type { SessionSummary } from '@/types/api'
import { I18nProvider } from '@/lib/i18n-context'
import { ToastProvider } from '@/lib/toast-context'
import { SessionList } from './SessionList'

afterEach(() => cleanup())

function makeSession(id: string, name: string): SessionSummary {
    return {
        id,
        active: true,
        thinking: false,
        activeAt: 1,
        updatedAt: 2,
        metadata: { path: '/project/a', name, flavor: 'codex' },
        metadataVersion: 0,
        agentStateVersion: 0,
        todosUpdatedAt: 0,
        todoProgress: null,
        pendingRequestsCount: 0,
        pendingRequestKinds: [],
        pendingRequests: [],
        backgroundTaskCount: 0,
        futureScheduledMessageCount: 0,
        nextScheduledAt: null,
        model: null,
        effort: null
    } as SessionSummary
}

function renderWithProviders(children: ReactNode) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <I18nProvider>{children}</I18nProvider>
            </ToastProvider>
        </QueryClientProvider>
    )
}

describe('SessionList secondary groups', () => {
    it('renders custom and ungrouped buckets under the official directory group', async () => {
        const groupId = '11111111-1111-4111-8111-111111111111'
        const api = {
            getSessionGroups: vi.fn().mockResolvedValue({
                groups: [{ id: groupId, projectKey: '/project/a', name: 'Review', createdAt: 1, updatedAt: 1 }],
                memberships: [{ sessionId: 'grouped', groupId, projectKey: '/project/a', updatedAt: 1 }]
            })
        } as unknown as ApiClient

        renderWithProviders(
            <SessionList
                sessions={[makeSession('grouped', 'Grouped session'), makeSession('ungrouped', 'Ungrouped session')]}
                selectedSessionId={null}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={api}
            />
        )

        await waitFor(() => expect(screen.getByText('Review')).toBeInTheDocument())
        expect(screen.getByText('Ungrouped')).toBeInTheDocument()
        expect(screen.getByText('Grouped session')).toBeInTheDocument()
        expect(screen.getByText('Ungrouped session')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'New group' }))
        expect(screen.getByRole('dialog')).toHaveTextContent('Create session group')
    })

    it('keeps disclosure keyboard and group action clicks independent', async () => {
        const groupId = '11111111-1111-4111-8111-111111111111'
        const api = {
            getSessionGroups: vi.fn().mockResolvedValue({
                groups: [{ id: groupId, projectKey: '/project/a', name: 'Review', createdAt: 1, updatedAt: 1 }],
                memberships: [{ sessionId: 'grouped', groupId, projectKey: '/project/a', updatedAt: 1 }]
            })
        } as unknown as ApiClient

        renderWithProviders(
            <SessionList
                sessions={[makeSession('grouped', 'Grouped session')]}
                selectedSessionId={null}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={api}
            />
        )

        const disclosure = await screen.findByRole('button', { name: /Review/ })
        const renameButton = screen.getByRole('button', { name: 'Rename group' })
        const deleteButton = screen.getByRole('button', { name: 'Delete group' })

        expect(disclosure.tagName).toBe('BUTTON')
        expect(disclosure).not.toContainElement(renameButton)
        expect(disclosure).not.toContainElement(deleteButton)
        expect(disclosure).toHaveAttribute('aria-expanded', 'true')

        fireEvent.click(disclosure)
        expect(disclosure).toHaveAttribute('aria-expanded', 'false')

        fireEvent.keyDown(renameButton, { key: 'Enter' })
        expect(disclosure).toHaveAttribute('aria-expanded', 'false')

        fireEvent.click(renameButton)
        expect(screen.getByRole('dialog')).toHaveTextContent('Rename session group')
        expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    })
})
