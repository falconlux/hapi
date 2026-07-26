import { getHapiCommandProgress, type HapiCommandProgress } from '@hapi/protocol'

const DEFAULT_MAX_PREVIEW_LINES = 5
const DEFAULT_MAX_PREVIEW_CHARS = 1_200

export function getLiveCommandProgress(input: unknown): HapiCommandProgress | null {
    return getHapiCommandProgress(input)
}

export function formatLiveCommandOutput(
    output: string,
    maxLines = DEFAULT_MAX_PREVIEW_LINES,
    maxChars = DEFAULT_MAX_PREVIEW_CHARS
): { text: string; clipped: boolean } {
    const normalized = output.replace(/\r(?!\n)/g, '\n').trimEnd()
    if (!normalized) return { text: '', clipped: false }

    const lines = normalized.split('\n')
    const visibleLines = lines.slice(-maxLines)
    let text = visibleLines.join('\n')
    let clipped = visibleLines.length < lines.length

    if (text.length > maxChars) {
        text = text.slice(-maxChars)
        clipped = true
    }

    return {
        text: clipped ? `…\n${text.replace(/^\n+/, '')}` : text,
        clipped
    }
}
