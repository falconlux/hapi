import { clearPersistedMessageWindowStorage } from '@/lib/message-window-storage'
import { clearScrollRestorationStorage } from '@/lib/scrollStorageGuard'

type CacheStorageAccess = Pick<CacheStorage, 'keys' | 'delete'>

export type ClearAppCacheOptions = {
    cacheStorage?: CacheStorageAccess | null
    localStorage?: Storage | null
    sessionStorage?: Storage | null
    reload?: () => void
}

function getCacheStorage(): CacheStorageAccess | null {
    try {
        return typeof globalThis.caches === 'undefined' ? null : globalThis.caches
    } catch {
        return null
    }
}

function getSessionStorage(): Storage | null {
    try {
        return typeof globalThis.sessionStorage === 'undefined' ? null : globalThis.sessionStorage
    } catch {
        return null
    }
}

function getLocalStorage(): Storage | null {
    try {
        return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
    } catch {
        return null
    }
}

export async function clearAppCacheAndReload(options: ClearAppCacheOptions = {}): Promise<void> {
    const cacheStorage = options.cacheStorage === undefined ? getCacheStorage() : options.cacheStorage
    const localStorage = options.localStorage === undefined ? getLocalStorage() : options.localStorage
    const sessionStorage = options.sessionStorage === undefined ? getSessionStorage() : options.sessionStorage

    if (cacheStorage) {
        const cacheNames = await cacheStorage.keys()
        await Promise.all(cacheNames.map((cacheName) => cacheStorage.delete(cacheName)))
    }

    if (sessionStorage) {
        clearPersistedMessageWindowStorage(sessionStorage)
    }
    clearScrollRestorationStorage([localStorage, sessionStorage])

    const reload = options.reload ?? (() => window.location.reload())
    reload()
}
