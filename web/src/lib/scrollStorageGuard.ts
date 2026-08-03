import { storageKey } from '@tanstack/router-core'

const STORAGE_KEY = storageKey
const STORAGE_KEY_PREFIX = 'tsr-scroll-restoration-'

function clearStorage(storage: Storage): void {
    try {
        storage.removeItem(STORAGE_KEY)
    } catch {
        return
    }

    // Also clear keys left by older/newer TanStack Router storage versions.
    // Iterate backwards because removeItem changes Storage.length.
    try {
        for (let index = storage.length - 1; index >= 0; index -= 1) {
            const key = storage.key(index)
            if (key?.startsWith(STORAGE_KEY_PREFIX)) {
                storage.removeItem(key)
            }
        }
    } catch {
        // Storage can be unavailable in private browsing or restricted WebViews.
    }
}

function getBrowserStorage(name: 'localStorage' | 'sessionStorage'): Storage | null {
    if (typeof window === 'undefined') return null
    try {
        return window[name]
    } catch {
        return null
    }
}

/**
 * Remove TanStack Router's persisted scroll cache from both browser stores.
 *
 * Router-level scroll restoration is disabled in `router.tsx`: chat and file
 * surfaces already own their scrolling, while the global cache can grow until
 * Web Storage throws synchronously and blocks navigation. Cleaning both stores
 * repairs clients that still have data written by older HAPI versions.
 */
export function clearScrollRestorationStorage(
    storages: Array<Storage | null> = [
        getBrowserStorage('localStorage'),
        getBrowserStorage('sessionStorage'),
    ],
): void {
    for (const storage of storages) {
        if (!storage) continue
        try {
            clearStorage(storage)
        } catch {
            // Non-fatal: the application must still start without Web Storage.
        }
    }
}
