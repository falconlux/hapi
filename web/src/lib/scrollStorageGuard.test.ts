import { describe, expect, it, vi } from 'vitest'
import { storageKey as STORAGE_KEY } from '@tanstack/router-core'

import { clearScrollRestorationStorage } from './scrollStorageGuard'

function makeMockStorage(): Storage & { _store: Record<string, string>; _setItem: ReturnType<typeof vi.fn> } {
    const store: Record<string, string> = {}
    const setItem = vi.fn((key: string, value: string) => { store[key] = value })
    const storage = {
        setItem,
        getItem: (key: string) => store[key] ?? null,
        removeItem: vi.fn((key: string) => { delete store[key] }),
        clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k] }),
        key: (index: number) => Object.keys(store)[index] ?? null,
        get length() { return Object.keys(store).length },
    } as unknown as Storage & { _store: Record<string, string>; _setItem: ReturnType<typeof vi.fn> }
    storage._store = store
    storage._setItem = setItem
    return storage
}

describe('clearScrollRestorationStorage', () => {
    it('removes current and legacy TanStack scroll keys from both stores', () => {
        const local = makeMockStorage()
        const session = makeMockStorage()
        local.setItem(STORAGE_KEY, 'current')
        local.setItem('tsr-scroll-restoration-v1_2', 'legacy')
        local.setItem('hapi-lang', 'zh-CN')
        session.setItem(STORAGE_KEY, 'current')
        session.setItem('hapi:message-window:v1:abc', 'messages')

        clearScrollRestorationStorage([local, session])

        expect(local.getItem(STORAGE_KEY)).toBeNull()
        expect(local.getItem('tsr-scroll-restoration-v1_2')).toBeNull()
        expect(session.getItem(STORAGE_KEY)).toBeNull()
        expect(local.getItem('hapi-lang')).toBe('zh-CN')
        expect(session.getItem('hapi:message-window:v1:abc')).toBe('messages')
    })

    it('continues when one browser storage is unavailable', () => {
        const unavailable = makeMockStorage()
        unavailable.removeItem = vi.fn(() => {
            throw new DOMException('blocked', 'SecurityError')
        })
        const available = makeMockStorage()
        available.setItem(STORAGE_KEY, 'value')

        expect(() => clearScrollRestorationStorage([unavailable, available])).not.toThrow()
        expect(available.getItem(STORAGE_KEY)).toBeNull()
    })
})
