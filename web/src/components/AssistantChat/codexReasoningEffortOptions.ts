export type CodexComposerReasoningEffortOption = {
    value: string | null
    label: string
}

export type ComposerReasoningEffortSourceOption = {
    value: string
    name?: string
}

const CODEX_REASONING_EFFORT_PRESETS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const
const CODEX_ALWAYS_AVAILABLE_REASONING_EFFORTS = ['max', 'ultra'] as const
const CODEX_REASONING_EFFORT_LABELS: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'XHigh',
    max: 'Max',
    ultra: 'Ultra'
}

function normalizeCodexComposerReasoningEffort(effort?: string | null): string | null {
    const trimmedEffort = effort?.trim().toLowerCase()
    if (!trimmedEffort || trimmedEffort === 'default') {
        return null
    }

    return trimmedEffort
}

function formatCodexReasoningEffortLabel(effort: string): string {
    return CODEX_REASONING_EFFORT_LABELS[effort as keyof typeof CODEX_REASONING_EFFORT_LABELS]
        ?? `${effort.charAt(0).toUpperCase()}${effort.slice(1)}`
}

function buildDynamicReasoningEffortOptions(
    currentEffort: string | null,
    dynamicOptions: ComposerReasoningEffortSourceOption[],
    alwaysAvailableOptions: readonly string[] = []
): CodexComposerReasoningEffortOption[] {
    const mergedDynamicOptions = [...dynamicOptions]
    const optionValues = new Set(mergedDynamicOptions.map((option) => option.value))
    for (const value of alwaysAvailableOptions) {
        if (!optionValues.has(value)) {
            mergedDynamicOptions.push({ value })
            optionValues.add(value)
        }
    }
    const options: CodexComposerReasoningEffortOption[] = [
        { value: null, label: 'Default' }
    ]

    if (currentEffort && !optionValues.has(currentEffort)) {
        options.push({
            value: currentEffort,
            label: formatCodexReasoningEffortLabel(currentEffort)
        })
    }

    options.push(...mergedDynamicOptions.map((option) => ({
        value: option.value,
        label: option.name ?? formatCodexReasoningEffortLabel(option.value)
    })))

    return options
}

export function getCodexComposerReasoningEffortOptions(
    currentEffort?: string | null,
    flavor?: string | null,
    dynamicOptions?: ComposerReasoningEffortSourceOption[] | null
): CodexComposerReasoningEffortOption[] {
    const normalizedCurrentEffort = normalizeCodexComposerReasoningEffort(currentEffort)

    if (flavor === 'opencode') {
        if (!dynamicOptions || dynamicOptions.length === 0) {
            return []
        }
        return buildDynamicReasoningEffortOptions(normalizedCurrentEffort, dynamicOptions)
    }

    if (dynamicOptions && dynamicOptions.length > 0) {
        return buildDynamicReasoningEffortOptions(
            normalizedCurrentEffort,
            dynamicOptions,
            CODEX_ALWAYS_AVAILABLE_REASONING_EFFORTS
        )
    }

    const options: CodexComposerReasoningEffortOption[] = [
        { value: null, label: 'Default' }
    ]

    if (
        normalizedCurrentEffort
        && !(CODEX_REASONING_EFFORT_PRESETS as readonly string[]).includes(normalizedCurrentEffort)
    ) {
        options.push({
            value: normalizedCurrentEffort,
            label: formatCodexReasoningEffortLabel(normalizedCurrentEffort)
        })
    }

    options.push(...CODEX_REASONING_EFFORT_PRESETS.map((effort) => ({
        value: effort,
        label: CODEX_REASONING_EFFORT_LABELS[effort]
    })))

    return options
}
