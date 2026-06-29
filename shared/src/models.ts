export const CLAUDE_MODEL_LABELS = {
    'claude-fable-5': 'Fable 5',
    'claude-fable-5[1m]': 'Fable 5 1M',
    sonnet: 'Sonnet',
    'sonnet[1m]': 'Sonnet 1M',
    'claude-opus-4-6': 'Opus 4.6',
    'claude-opus-4-6[1m]': 'Opus 4.6 1M',
    'claude-opus-4-7': 'Opus 4.7',
    'claude-opus-4-7[1m]': 'Opus 4.7 1M',
    'claude-opus-4-8': 'Opus 4.8',
    'claude-opus-4-8[1m]': 'Opus 4.8 1M',
    // GLM models via newapi gateway (glm_channel_conn)
    'glm-5.2': 'GLM 5.2',
    'glm-5': 'GLM 5',
    'deepseek-r1': 'DeepSeek R1',
    'qwen-plus': 'Qwen Plus',
} as const

export type ClaudeModelPreset = keyof typeof CLAUDE_MODEL_LABELS
export const CLAUDE_MODEL_PRESETS = Object.keys(CLAUDE_MODEL_LABELS) as ClaudeModelPreset[]

export const GEMINI_MODEL_LABELS = {
    'gemini-3.1-pro-preview': 'Gemini 3.1 Pro Preview',
    'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
} as const

export type GeminiModelPreset = keyof typeof GEMINI_MODEL_LABELS
export const GEMINI_MODEL_PRESETS = Object.keys(GEMINI_MODEL_LABELS) as GeminiModelPreset[]
export const DEFAULT_GEMINI_MODEL: GeminiModelPreset = 'gemini-2.5-pro'

export const GLM_MODEL_LABELS = {
    'glm-5.2': 'GLM 5.2',
    'glm-5': 'GLM 5',
    'deepseek-r1': 'DeepSeek R1',
    'qwen-plus': 'Qwen Plus',
    'qwen-turbo': 'Qwen Turbo',
    'grok-4': 'Grok 4',
} as const

export type GlmModelPreset = keyof typeof GLM_MODEL_LABELS
export const GLM_MODEL_PRESETS = Object.keys(GLM_MODEL_LABELS) as GlmModelPreset[]
export const DEFAULT_GLM_MODEL: GlmModelPreset = 'glm-5.2'

export function isClaudeModelPreset(model: string | null | undefined): model is ClaudeModelPreset {
    return typeof model === 'string' && Object.hasOwn(CLAUDE_MODEL_LABELS, model)
}

export function getClaudeModelLabel(model: string): string | null {
    const trimmedModel = model.trim()
    if (!trimmedModel) {
        return null
    }

    return CLAUDE_MODEL_LABELS[trimmedModel as ClaudeModelPreset] ?? null
}
