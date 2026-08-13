type SessionProjectMetadata = {
    path?: string | null
    worktree?: { basePath?: string | null } | null
} | null | undefined

export function normalizeSessionProjectKey(value: string | null | undefined): string | null {
    const trimmed = value?.trim()
    if (!trimmed) return null
    if (trimmed === '/' || /^[A-Za-z]:[\\/]$/.test(trimmed)) return trimmed
    return trimmed.replace(/[\\/]+$/, '') || null
}

/** Hub-owned project scope: worktree root when present, otherwise session cwd. */
export function getCanonicalSessionProjectKey(metadata: SessionProjectMetadata): string | null {
    return normalizeSessionProjectKey(metadata?.worktree?.basePath)
        ?? normalizeSessionProjectKey(metadata?.path)
}
