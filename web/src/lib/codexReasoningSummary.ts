function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractReasoningText(value: unknown, depth = 0): string | null {
    if (depth > 3 || value === null || value === undefined) return null
    if (typeof value === 'string') return value

    if (Array.isArray(value)) {
        const parts = value
            .map((entry) => extractReasoningText(entry, depth + 1))
            .filter((entry): entry is string => Boolean(entry?.trim()))
        return parts.length > 0 ? parts.join('\n') : null
    }

    if (!isRecord(value)) return null

    for (const key of ['content', 'text', 'message', 'summary', 'output', 'result', 'data']) {
        const text = extractReasoningText(value[key], depth + 1)
        if (text?.trim()) return text
    }

    return null
}

function normalizeHeading(value: string): string {
    return value
        .trim()
        .replace(/^#{1,6}\s+/, '')
        .replace(/^\*\*([\s\S]+)\*\*$/, '$1')
        .replace(/^__([\s\S]+)__$/, '$1')
        .replace(/[\s。！？!?：:；;,.，]+$/g, '')
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase()
}

function removeRepeatedTitle(value: string, title: string | null | undefined): string {
    if (!title?.trim()) return value

    const lines = value.replace(/\r\n?/g, '\n').split('\n')
    const firstContentIndex = lines.findIndex((line) => line.trim().length > 0)
    if (firstContentIndex < 0) return ''

    if (normalizeHeading(lines[firstContentIndex]) === normalizeHeading(title)) {
        lines.splice(firstContentIndex, 1)
    }

    return lines.join('\n').trim()
}

function isHeadingOnly(value: string): boolean {
    const trimmed = value.trim()
    return /^\*\*[^*\n]+\*\*$/.test(trimmed)
        || /^__[^_\n]+__$/.test(trimmed)
        || /^#{1,6}\s+[^\n]+$/.test(trimmed)
}

function toPlainPreview(value: string): string {
    return value
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * Returns a short, user-facing Codex reasoning summary for inline display.
 * Hidden chain-of-thought is never reconstructed: this only surfaces the
 * already-provided public summary text and filters title-only noise.
 */
export function getCodexReasoningSummary(
    result: unknown,
    title?: string | null
): string | null {
    const extracted = extractReasoningText(result)
    if (!extracted?.trim()) return null

    const withoutRepeatedTitle = removeRepeatedTitle(extracted, title)
    if (!withoutRepeatedTitle || isHeadingOnly(withoutRepeatedTitle)) return null

    const preview = toPlainPreview(withoutRepeatedTitle)
    if (!preview || (title && normalizeHeading(preview) === normalizeHeading(title))) return null

    return preview
}
