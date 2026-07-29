import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAppCacheAndReload } from '@/lib/appCache'

describe('clearAppCacheAndReload', () => {
    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
    })

    it('clears Cache Storage and message windows while preserving sign-in and preferences', async () => {
        const cacheStorage = {
            keys: vi.fn(async () => ['workbox-precache', 'runtime-cache']),
            delete: vi.fn(async () => true),
        }
        const reload = vi.fn()

        sessionStorage.setItem('hapi:message-window:v1:session-a', 'cached-a')
        sessionStorage.setItem('hapi:message-window:v1:session-b', 'cached-b')
        sessionStorage.setItem('hapi:composer-drafts', 'draft')
        localStorage.setItem('hapi_access_token::https://example.test', 'token')
        localStorage.setItem('hapi-lang', 'zh-CN')

        await clearAppCacheAndReload({ cacheStorage, sessionStorage, reload })

        expect(cacheStorage.keys).toHaveBeenCalledOnce()
        expect(cacheStorage.delete).toHaveBeenCalledTimes(2)
        expect(cacheStorage.delete).toHaveBeenCalledWith('workbox-precache')
        expect(cacheStorage.delete).toHaveBeenCalledWith('runtime-cache')
        expect(sessionStorage.getItem('hapi:message-window:v1:session-a')).toBeNull()
        expect(sessionStorage.getItem('hapi:message-window:v1:session-b')).toBeNull()
        expect(sessionStorage.getItem('hapi:composer-drafts')).toBe('draft')
        expect(localStorage.getItem('hapi_access_token::https://example.test')).toBe('token')
        expect(localStorage.getItem('hapi-lang')).toBe('zh-CN')
        expect(reload).toHaveBeenCalledOnce()
    })

    it('still clears message windows when Cache Storage is unavailable', async () => {
        const reload = vi.fn()
        sessionStorage.setItem('hapi:message-window:v1:session-a', 'cached')

        await clearAppCacheAndReload({ cacheStorage: null, sessionStorage, reload })

        expect(sessionStorage.getItem('hapi:message-window:v1:session-a')).toBeNull()
        expect(reload).toHaveBeenCalledOnce()
    })

    it('does not reload when cache deletion fails', async () => {
        const cacheStorage = {
            keys: vi.fn(async () => ['broken-cache']),
            delete: vi.fn(async () => {
                throw new Error('cache delete failed')
            }),
        }
        const reload = vi.fn()

        await expect(clearAppCacheAndReload({ cacheStorage, sessionStorage, reload })).rejects.toThrow('cache delete failed')
        expect(reload).not.toHaveBeenCalled()
    })
})
