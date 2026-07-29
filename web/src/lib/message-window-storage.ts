export const MESSAGE_WINDOW_STORAGE_KEY_PREFIX = 'hapi:message-window:v1:'

export function clearPersistedMessageWindowStorage(storage: Storage): number {
    const keys: string[] = []

    for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key?.startsWith(MESSAGE_WINDOW_STORAGE_KEY_PREFIX)) {
            keys.push(key)
        }
    }

    for (const key of keys) {
        storage.removeItem(key)
    }

    return keys.length
}
