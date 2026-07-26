import { isObject } from './utils'

export const HAPI_COMMAND_PROGRESS_FIELD = '_hapiCommandProgress'

export type HapiCommandProgress = {
    status: 'running'
    outputTail: string
    outputChars: number
    truncated: boolean
}

export function withHapiCommandProgress(
    input: Record<string, unknown>,
    progress: HapiCommandProgress
): Record<string, unknown> {
    return {
        ...input,
        [HAPI_COMMAND_PROGRESS_FIELD]: progress
    }
}

export function getHapiCommandProgress(input: unknown): HapiCommandProgress | null {
    if (!isObject(input)) return null

    const progress = input[HAPI_COMMAND_PROGRESS_FIELD]
    if (!isObject(progress) || progress.status !== 'running') return null

    const outputTail = typeof progress.outputTail === 'string' ? progress.outputTail : ''
    const outputChars = typeof progress.outputChars === 'number' && Number.isFinite(progress.outputChars)
        ? Math.max(0, progress.outputChars)
        : outputTail.length
    const truncated = typeof progress.truncated === 'boolean'
        ? progress.truncated
        : outputChars > outputTail.length

    return {
        status: 'running',
        outputTail,
        outputChars,
        truncated
    }
}
