import { clearPersistedMessageWindowStorage } from '@/lib/message-window-storage'

type CacheStorageAccess = Pick<CacheStorage, 'keys' | 'delete'>

export type ClearAppCacheOptions = {
    cacheStorage?: CacheStorageAccess | null
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

export async function clearAppCacheAndReload(options: ClearAppCacheOptions = {}): Promise<void> {
    const cacheStorage = options.cacheStorage === undefined ? getCacheStorage() : options.cacheStorage
    const sessionStorage = options.sessionStorage === undefined ? getSessionStorage() : options.sessionStorage

    if (cacheStorage) {
        const cacheNames = await cacheStorage.keys()
        await Promise.all(cacheNames.map((cacheName) => cacheStorage.delete(cacheName)))
    }

    if (sessionStorage) {
        clearPersistedMessageWindowStorage(sessionStorage)
    }

    const reload = options.reload ?? (() => window.location.reload())
    reload()
}
