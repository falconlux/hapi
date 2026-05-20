import { useSyncExternalStore } from 'react'

const resolvedPermissions = new Set<string>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

function notify(): void {
    for (const listener of listeners) {
        listener()
    }
}

export function isPermissionResolved(id: string): boolean {
    return resolvedPermissions.has(id)
}

export function markPermissionResolved(id: string): void {
    const before = resolvedPermissions.size
    resolvedPermissions.add(id)
    if (resolvedPermissions.size !== before) {
        notify()
    }
}

export function usePermissionResolved(id: string | undefined): boolean {
    return useSyncExternalStore(
        subscribe,
        () => id !== undefined && isPermissionResolved(id),
        () => false
    )
}
