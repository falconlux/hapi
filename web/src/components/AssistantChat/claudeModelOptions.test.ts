import { describe, expect, it } from 'vitest'
import { getClaudeComposerModelOptions, getNextClaudeComposerModel } from './claudeModelOptions'

describe('getClaudeComposerModelOptions', () => {
    it('includes the active non-preset Claude model in the options list', () => {
        const options = getClaudeComposerModelOptions('claude-opus-4-1-20250805')
        expect(options[0]).toEqual({ value: null, label: 'Default' })
        expect(options).toContainEqual({ value: 'claude-opus-4-1-20250805', label: 'claude-opus-4-1-20250805' })
        expect(options).toContainEqual({ value: 'claude-fable-5', label: 'Fable 5' })
        expect(options).toContainEqual({ value: 'claude-opus-4-8', label: 'Opus 4.8' })
        expect(options).toContainEqual({ value: 'claude-opus-5', label: 'Opus 5' })
    })

    it('does not duplicate preset Claude models', () => {
        const options = getClaudeComposerModelOptions('claude-opus-4-8')
        expect(options.filter((option) => option.value === 'claude-opus-4-8')).toHaveLength(1)
    })
})

describe('getNextClaudeComposerModel', () => {
    it('cycles from a non-preset Claude model to the next selectable model instead of auto', () => {
        expect(getNextClaudeComposerModel('claude-opus-4-1-20250805')).toBe('claude-fable-5')
    })
})
