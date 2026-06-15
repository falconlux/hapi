import { readFileSync } from 'node:fs'

let cachedSystemPromptOverride: string | null | undefined

export function getSystemPromptOverride(): string | null {
    if (cachedSystemPromptOverride !== undefined) {
        return cachedSystemPromptOverride
    }

    const filePath = process.env.HAPI_SYSTEM_PROMPT_FILE
    if (!filePath) {
        cachedSystemPromptOverride = null
        return cachedSystemPromptOverride
    }

    try {
        cachedSystemPromptOverride = readFileSync(filePath, 'utf8')
    } catch {
        cachedSystemPromptOverride = null
    }

    return cachedSystemPromptOverride
}
