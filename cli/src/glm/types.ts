import type { GlmPermissionMode } from '@hapi/protocol/types'

export type PermissionMode = GlmPermissionMode

export interface GlmMode {
    model?: string
}

export interface OpenAIChatMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export interface OpenAIStreamChunk {
    choices: Array<{
        delta: {
            content?: string
            role?: string
        }
        finish_reason?: string | null
    }>
}

export interface OpenAIResponse {
    choices: Array<{
        message: {
            content: string
        }
        finish_reason?: string
    }>
}
