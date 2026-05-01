import { MODEL_OPTIONS } from '@/components/NewSession/types'
import { getClaudeComposerModelOptions, getNextClaudeComposerModel } from './claudeModelOptions'
import type { ClaudeComposerModelOption } from './claudeModelOptions'

export type ModelOption = ClaudeComposerModelOption

function getPresetModelOptions(flavor: 'gemini' | 'codex', currentModel?: string | null): ModelOption[] {
    const options = MODEL_OPTIONS[flavor].map((m) => ({
        value: m.value === 'auto' ? null : m.value,
        label: m.label
    }))
    const normalized = currentModel?.trim() || null
    if (normalized && !options.some((o) => o.value === normalized)) {
        options.splice(1, 0, { value: normalized, label: normalized })
    }
    return options
}

function getNextPresetModel(flavor: 'gemini' | 'codex', currentModel?: string | null): string | null {
    const options = getPresetModelOptions(flavor, currentModel)
    const currentIndex = options.findIndex((o) => o.value === (currentModel ?? null))
    if (currentIndex === -1) {
        return options[0]?.value ?? null
    }
    return options[(currentIndex + 1) % options.length]?.value ?? null
}

export function getModelOptionsForFlavor(flavor: string | undefined | null, currentModel?: string | null): ModelOption[] {
    if (flavor === 'gemini' || flavor === 'codex') {
        return getPresetModelOptions(flavor, currentModel)
    }
    return getClaudeComposerModelOptions(currentModel)
}

export function getNextModelForFlavor(flavor: string | undefined | null, currentModel?: string | null): string | null {
    if (flavor === 'gemini' || flavor === 'codex') {
        return getNextPresetModel(flavor, currentModel)
    }
    return getNextClaudeComposerModel(currentModel)
}
