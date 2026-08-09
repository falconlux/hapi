import { CLAUDE_MODEL_PRESETS, getClaudeModelLabel } from '@hapi/protocol'
import { describe, expect, it } from 'vitest'
import { CLAUDE_EFFORT_OPTIONS, GROK_EFFORT_OPTIONS, MODEL_OPTIONS } from './types'

describe('Claude model options', () => {
    it('derives options from shared Claude model presets', () => {
        expect(MODEL_OPTIONS.claude).toEqual([
            { value: 'auto', label: 'Default' },
            ...CLAUDE_MODEL_PRESETS.map((model) => ({
                value: model,
                label: getClaudeModelLabel(model) ?? model
            }))
        ])
    })

    it('exposes friendly labels for Claude model presets', () => {
        expect(CLAUDE_MODEL_PRESETS).toContain('claude-fable-5')
        expect(CLAUDE_MODEL_PRESETS).toContain('claude-opus-4-6')
        expect(CLAUDE_MODEL_PRESETS).toContain('claude-opus-4-7')
        expect(CLAUDE_MODEL_PRESETS).toContain('claude-opus-4-8')
        expect(CLAUDE_MODEL_PRESETS).toContain('claude-opus-5')
        expect(getClaudeModelLabel('sonnet[1m]')).toBe('Sonnet 1M')
        expect(getClaudeModelLabel('opus[1m]')).toBe('Opus 1M')
        expect(getClaudeModelLabel('claude-opus-4-6')).toBe('Opus 4.6')
        expect(getClaudeModelLabel('claude-opus-4-6[1m]')).toBe('Opus 4.6 1M')
        expect(getClaudeModelLabel('claude-opus-5')).toBe('Opus 5')
        expect(getClaudeModelLabel('fable[1m]')).toBe('Fable 1M')
    })

    it('keeps gateway-specific Codex models available as local fallbacks', () => {
        expect(MODEL_OPTIONS.codex).toContainEqual({ value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' })
        expect(MODEL_OPTIONS.codex).toContainEqual({ value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' })
        expect(MODEL_OPTIONS.codex).toContainEqual({ value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' })
    })
})

describe('Claude effort options', () => {
    it('matches supported effort presets in expected order', () => {
        expect(CLAUDE_EFFORT_OPTIONS).toEqual([
            { value: 'auto', label: 'Auto' },
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'xhigh', label: 'XHigh' },
            { value: 'max', label: 'Max' },
        ])
    })
})

describe('Grok effort options', () => {
    it('offers only the effort levels supported by grok-4.5', () => {
        expect(GROK_EFFORT_OPTIONS).toEqual([
            { value: 'auto', label: 'Default' },
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
        ])
    })
})
