import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { ApiClient } from '@/api/client'
import type { SessionSummary } from '@/types/api'
import { I18nProvider } from '@/lib/i18n-context'
import { ToastProvider } from '@/lib/toast-context'
import { queryKeys } from '@/lib/query-keys'
import { SessionList } from './SessionList'

afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
})

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

function renderWithProviders(children: ReactNode, queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
})) {
    return {
        ...render(
            <QueryClientProvider client={queryClient}>
                <ToastProvider>
                    <I18nProvider>{children}</I18nProvider>
                </ToastProvider>
            </QueryClientProvider>
        ),
        queryClient
    }
}

function createGroupedApi(): ApiClient {
    const groupId = '11111111-1111-4111-8111-111111111111'
    return {
        getSessionGroups: vi.fn().mockResolvedValue({
            groups: [{ id: groupId, projectKey: '/project/a', name: 'Review', createdAt: 1, updatedAt: 1 }],
            memberships: [{ sessionId: 'grouped', groupId, projectKey: '/project/a', updatedAt: 1 }]
        })
    } as unknown as ApiClient
}

function renderGroupedList(api: ApiClient = createGroupedApi()) {
    return renderWithProviders(
        <SessionList
            sessions={[makeSession('grouped', 'Grouped session')]}
            selectedSessionId={null}
            onSelect={vi.fn()}
            onNewSession={vi.fn()}
            onRefresh={vi.fn()}
            isLoading={false}
            renderHeader={false}
            api={api}
        />,
    )
}

describe('SessionList secondary groups', () => {
    it('renders direct sessions before named groups under the official directory group', async () => {
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
        expect(screen.queryByText('Ungrouped')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Ungrouped' })).not.toBeInTheDocument()
        expect(screen.getByText('Grouped session')).toBeInTheDocument()
        expect(screen.getByText('Ungrouped session')).toBeInTheDocument()

        const ungroupedRow = screen.getByText('Ungrouped session').closest('.session-list-item')
        const namedGroup = screen.getByRole('button', { name: /Review/ }).closest('[data-session-group-id]')
        expect(ungroupedRow).toBeInTheDocument()
        expect(ungroupedRow?.closest('[data-session-group-id]')).toBeNull()
        expect((ungroupedRow?.compareDocumentPosition(namedGroup as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING)
            .toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: 'New group' }))
        expect(screen.getByRole('dialog')).toHaveTextContent('Create session group')
    })

    it('renders no ungrouped placeholder when every session has a named group', async () => {
        renderGroupedList()

        await screen.findByRole('button', { name: /Review/ })
        expect(screen.queryByText('Ungrouped')).not.toBeInTheDocument()
        expect(document.querySelector('[data-session-group-kind="direct"]')).toBeNull()
        expect(screen.getByText('Grouped session')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Expand|Collapse/ })).not.toBeInTheDocument()
    })

    it('moves a session from a named group to the direct directory list after membership refresh', async () => {
        const groupId = '11111111-1111-4111-8111-111111111111'
        const getSessionGroups = vi.fn()
            .mockResolvedValueOnce({
                groups: [{ id: groupId, projectKey: '/project/a', name: 'Review', createdAt: 1, updatedAt: 1 }],
                memberships: [{ sessionId: 'grouped', groupId, projectKey: '/project/a', updatedAt: 1 }]
            })
            .mockResolvedValue({
                groups: [{ id: groupId, projectKey: '/project/a', name: 'Review', createdAt: 1, updatedAt: 2 }],
                memberships: []
            })
        const api = { getSessionGroups } as unknown as ApiClient
        const { queryClient } = renderGroupedList(api)
        const groupButton = await screen.findByRole('button', { name: /Review/ })
        expect(screen.getByText('Grouped session').closest('[data-session-group-id]')).not.toBeNull()

        // `session-groups-updated` invalidates this same query key in useSSE;
        // exercise the resulting refetch rather than mutating component state.
        await queryClient.invalidateQueries({ queryKey: queryKeys.sessionGroups })

        await waitFor(() => {
            expect(screen.getByText('Grouped session').closest('[data-session-group-id]')).toBeNull()
        })
        expect(getSessionGroups).toHaveBeenCalledTimes(2)
        expect(document.querySelector('[data-session-group-kind="direct"]')).toContainElement(
            screen.getByText('Grouped session').closest('.session-list-item')
        )
        expect(groupButton).toHaveAttribute('aria-expanded', 'false')
    })

    it('keeps direct sessions eligible for the existing row menu and move-to-group action', async () => {
        const api = {
            getSessionGroups: vi.fn().mockResolvedValue({
                groups: [{
                    id: '11111111-1111-4111-8111-111111111111',
                    projectKey: '/project/a',
                    name: 'Review',
                    createdAt: 1,
                    updatedAt: 1
                }],
                memberships: []
            })
        } as unknown as ApiClient
        renderWithProviders(
            <SessionList
                sessions={[makeSession('direct', 'Direct session')]}
                selectedSessionId={null}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={api}
            />
        )
        await screen.findByRole('button', { name: /Review/ })
        const row = await screen.findByRole('button', { name: /Direct session/ })
        vi.useFakeTimers()

        fireEvent.touchStart(row, { touches: [{ clientX: 40, clientY: 60 }] })
        act(() => vi.advanceTimersByTime(500))
        fireEvent.touchEnd(row, { changedTouches: [{ clientX: 40, clientY: 60 }] })

        expect(screen.getByRole('menuitem', { name: 'Move to group' })).toBeInTheDocument()
    })

    it('renders preview controls inside each large named group and keeps their pagination independent', async () => {
        const reviewGroupId = '11111111-1111-4111-8111-111111111111'
        const buildGroupId = '22222222-2222-4222-8222-222222222222'
        const reviewSessions = Array.from({ length: 10 }, (_, index) => ({
            ...makeSession(`review-${index + 1}`, `Review ${index + 1}`),
            updatedAt: 200 - index
        }))
        const buildSessions = Array.from({ length: 10 }, (_, index) => ({
            ...makeSession(`build-${index + 1}`, `Build ${index + 1}`),
            updatedAt: 100 - index
        }))
        const sessions = [...reviewSessions, ...buildSessions]
        const api = {
            getSessionGroups: vi.fn().mockResolvedValue({
                groups: [
                    { id: reviewGroupId, projectKey: '/project/a', name: 'Review', createdAt: 1, updatedAt: 1 },
                    { id: buildGroupId, projectKey: '/project/a', name: 'Build', createdAt: 2, updatedAt: 2 }
                ],
                memberships: sessions.map((session) => ({
                    sessionId: session.id,
                    groupId: session.id.startsWith('review-') ? reviewGroupId : buildGroupId,
                    projectKey: '/project/a',
                    updatedAt: 1
                }))
            })
        } as unknown as ApiClient

        renderWithProviders(
            <SessionList
                sessions={sessions}
                selectedSessionId={null}
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={api}
            />
        )

        const reviewGroup = (await screen.findByRole('button', { name: 'Review (10)' }))
            .closest('[data-session-group-id]') as HTMLElement
        const buildGroup = screen.getByRole('button', { name: 'Build (10)' })
            .closest('[data-session-group-id]') as HTMLElement

        expect(reviewGroup).toHaveTextContent('(10)')
        expect(buildGroup).toHaveTextContent('(10)')
        expect(reviewGroup.querySelectorAll('.session-list-item')).toHaveLength(8)
        expect(buildGroup.querySelectorAll('.session-list-item')).toHaveLength(8)
        expect(screen.queryByText('Review 9')).not.toBeInTheDocument()
        expect(screen.queryByText('Build 9')).not.toBeInTheDocument()

        const reviewExpand = reviewGroup.querySelector('button[aria-label="Expand 2"]')
            ?? Array.from(reviewGroup.querySelectorAll('button')).find((button) => button.textContent?.includes('Expand 2'))
        const buildExpand = Array.from(buildGroup.querySelectorAll('button'))
            .find((button) => button.textContent?.includes('Expand 2'))
        expect(reviewExpand).toBeInTheDocument()
        expect(buildExpand).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: 'Expand 2' }).every((button) => (
            button.closest('[data-session-group-id]') !== null
        ))).toBe(true)

        fireEvent.click(reviewExpand as HTMLButtonElement)
        await waitFor(() => expect(reviewGroup.querySelectorAll('.session-list-item')).toHaveLength(10))
        expect(buildGroup.querySelectorAll('.session-list-item')).toHaveLength(8)
        expect(screen.getByText('Review 10')).toBeInTheDocument()
        expect(screen.queryByText('Build 10')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Collapse 2' }))
        await waitFor(() => expect(reviewGroup.querySelectorAll('.session-list-item')).toHaveLength(8))
        expect(buildGroup.querySelectorAll('.session-list-item')).toHaveLength(8)
    })

    it('hides a named group preview control while the group is collapsed and restores it on expansion', async () => {
        const groupId = '11111111-1111-4111-8111-111111111111'
        const sessions = Array.from({ length: 10 }, (_, index) => ({
            ...makeSession(`session-${index + 1}`, `Session ${index + 1}`),
            active: false,
            updatedAt: 100 - index
        }))
        const api = {
            getSessionGroups: vi.fn().mockResolvedValue({
                groups: [{ id: groupId, projectKey: '/project/a', name: 'Review', createdAt: 1, updatedAt: 1 }],
                memberships: sessions.map((session) => ({
                    sessionId: session.id,
                    groupId,
                    projectKey: '/project/a',
                    updatedAt: 1
                }))
            })
        } as unknown as ApiClient

        renderWithProviders(
            <SessionList
                sessions={sessions}
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
        expect(disclosure).toHaveAttribute('aria-expanded', 'false')
        const namedGroup = disclosure.closest('[data-session-group-id]') as HTMLElement
        expect(screen.queryByRole('button', { name: 'Expand 2' })).not.toBeInTheDocument()

        fireEvent.click(disclosure)
        expect(disclosure).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('button', { name: 'Expand 2' }).closest('[data-session-group-id]')).toBe(namedGroup)

        fireEvent.click(disclosure)
        expect(disclosure).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('button', { name: 'Expand 2' })).not.toBeInTheDocument()
    })

    it('keeps direct sessions outside named pagination and removes the directory-level preview control', async () => {
        const groupId = '11111111-1111-4111-8111-111111111111'
        const sessions = Array.from({ length: 10 }, (_, index) => ({
            ...makeSession(`session-${index + 1}`, `Session ${index + 1}`),
            active: false,
            updatedAt: 100 - index
        }))
        const api = {
            getSessionGroups: vi.fn().mockResolvedValue({
                groups: [{ id: groupId, projectKey: '/project/a', name: 'Review', createdAt: 1, updatedAt: 1 }],
                memberships: sessions.slice(1).map((session) => ({
                    sessionId: session.id,
                    groupId,
                    projectKey: '/project/a',
                    updatedAt: 1
                }))
            })
        } as unknown as ApiClient

        renderWithProviders(
            <SessionList
                sessions={sessions}
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
        expect(disclosure).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByText('Session 1').closest('[data-session-group-kind="direct"]')).not.toBeNull()
        expect(screen.queryByRole('button', { name: /Expand/ })).not.toBeInTheDocument()
    })

    it('expands the named group preview cap to reveal a selected session in its natural position', async () => {
        const groupId = '11111111-1111-4111-8111-111111111111'
        const sessions = Array.from({ length: 18 }, (_, index) => ({
            ...makeSession(`session-${index + 1}`, `Session ${index + 1}`),
            updatedAt: 100 - index
        }))
        const api = {
            getSessionGroups: vi.fn().mockResolvedValue({
                groups: [{ id: groupId, projectKey: '/project/a', name: 'Review', createdAt: 1, updatedAt: 1 }],
                memberships: sessions.map((session) => ({
                    sessionId: session.id,
                    groupId,
                    projectKey: '/project/a',
                    updatedAt: 1
                }))
            })
        } as unknown as ApiClient

        renderWithProviders(
            <SessionList
                sessions={sessions}
                selectedSessionId="session-18"
                onSelect={vi.fn()}
                onNewSession={vi.fn()}
                onRefresh={vi.fn()}
                isLoading={false}
                renderHeader={false}
                api={api}
            />
        )

        const namedGroup = (await screen.findByRole('button', { name: 'Review (18)' }))
            .closest('[data-session-group-id]') as HTMLElement
        await waitFor(() => expect(namedGroup.querySelectorAll('.session-list-item')).toHaveLength(18))
        expect(screen.getByText('Session 18').closest('[data-session-group-id]')).toBe(namedGroup)
        expect(screen.getByRole('button', { name: 'Collapse 8' })).toBeInTheDocument()
    })

    it('shows no persistent action icons and keeps a short click dedicated to disclosure', async () => {
        renderGroupedList()

        const disclosure = await screen.findByRole('button', { name: /Review/ })
        expect(disclosure.tagName).toBe('BUTTON')
        expect(screen.queryByRole('button', { name: 'Rename group' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Delete group' })).not.toBeInTheDocument()
        expect(disclosure).toHaveAttribute('aria-expanded', 'true')

        fireEvent.click(disclosure)
        expect(disclosure).toHaveAttribute('aria-expanded', 'false')

        // Native buttons translate Enter/Space into a detail-zero click. The
        // custom context-menu key handling must leave that behavior intact.
        fireEvent.keyDown(disclosure, { key: 'Enter' })
        fireEvent.click(disclosure, { detail: 0 })
        expect(disclosure).toHaveAttribute('aria-expanded', 'true')

        fireEvent.keyDown(disclosure, { key: ' ' })
        fireEvent.click(disclosure, { detail: 0 })
        expect(disclosure).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('menu', { name: 'Group actions' })).not.toBeInTheDocument()
    })

    it('opens the action menu on touch long press without folding and cancels its compatibility click', async () => {
        renderGroupedList()
        const disclosure = await screen.findByRole('button', { name: /Review/ })
        vi.useFakeTimers()

        fireEvent.touchStart(disclosure, { touches: [{ clientX: 40, clientY: 60 }] })
        act(() => vi.advanceTimersByTime(500))
        fireEvent.touchEnd(disclosure, { changedTouches: [{ clientX: 40, clientY: 60 }] })
        fireEvent.click(disclosure, { detail: 1 })

        expect(screen.getByRole('menu', { name: 'Group actions' })).toBeInTheDocument()
        expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    })

    it('cancels touch long press after movement or cancellation', async () => {
        renderGroupedList()
        const disclosure = await screen.findByRole('button', { name: /Review/ })
        vi.useFakeTimers()

        fireEvent.touchStart(disclosure, { touches: [{ clientX: 40, clientY: 60 }] })
        fireEvent.touchMove(disclosure, { touches: [{ clientX: 40, clientY: 90 }] })
        act(() => vi.advanceTimersByTime(500))
        expect(screen.queryByRole('menu', { name: 'Group actions' })).not.toBeInTheDocument()

        fireEvent.touchStart(disclosure, { touches: [{ clientX: 40, clientY: 60 }] })
        fireEvent.touchCancel(disclosure)
        act(() => vi.advanceTimersByTime(500))
        expect(screen.queryByRole('menu', { name: 'Group actions' })).not.toBeInTheDocument()
        expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    })

    it('opens from right-click, Shift+F10, and ContextMenu without folding; Escape and outside click close it', async () => {
        renderGroupedList()
        const disclosure = await screen.findByRole('button', { name: /Review/ })

        fireEvent.contextMenu(disclosure, { clientX: 120, clientY: 160 })
        expect(screen.getByRole('menu', { name: 'Group actions' })).toBeInTheDocument()
        expect(disclosure).toHaveAttribute('aria-expanded', 'true')

        fireEvent.keyDown(document, { key: 'Escape' })
        expect(screen.queryByRole('menu', { name: 'Group actions' })).not.toBeInTheDocument()

        fireEvent.keyDown(disclosure, { key: 'F10', shiftKey: true })
        expect(screen.getByRole('menu', { name: 'Group actions' })).toBeInTheDocument()
        fireEvent.pointerDown(document.body)
        expect(screen.queryByRole('menu', { name: 'Group actions' })).not.toBeInTheDocument()

        fireEvent.keyDown(disclosure, { key: 'ContextMenu' })
        expect(screen.getByRole('menu', { name: 'Group actions' })).toBeInTheDocument()
        expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    })

    it('opens the existing rename and delete dialogs from the action menu', async () => {
        renderGroupedList()
        const disclosure = await screen.findByRole('button', { name: /Review/ })

        fireEvent.contextMenu(disclosure, { clientX: 120, clientY: 160 })
        fireEvent.click(screen.getByRole('menuitem', { name: 'Rename group' }))
        expect(screen.getByRole('dialog')).toHaveTextContent('Rename session group')
        expect(disclosure).toHaveAttribute('aria-expanded', 'true')

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        fireEvent.contextMenu(disclosure, { clientX: 120, clientY: 160 })
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete group' }))
        expect(screen.getByRole('dialog')).toHaveTextContent('Delete session group')
        expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    })

    it('clamps the action menu inside the viewport', async () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 })
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 480 })
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            if (this.classList.contains('min-w-[180px]')) {
                return {
                    width: 180,
                    height: 100,
                    top: 0,
                    right: 180,
                    bottom: 100,
                    left: 0,
                    x: 0,
                    y: 0,
                    toJSON: () => ({})
                }
            }
            return {
                width: 0,
                height: 0,
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                x: 0,
                y: 0,
                toJSON: () => ({})
            }
        })
        renderGroupedList()
        const disclosure = await screen.findByRole('button', { name: /Review/ })

        fireEvent.contextMenu(disclosure, { clientX: 1_000, clientY: 1_000 })
        const menuContainer = screen.getByRole('menu', { name: 'Group actions' }).parentElement

        expect(menuContainer).toHaveStyle({ left: '132px' })
        expect(menuContainer?.style.top).toContain('372px')
    })
})
