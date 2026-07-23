import { describe, expect, it } from 'vitest'
import { CODEX_REASONING_EFFORT_OPTIONS } from './types'

describe('Codex new-session reasoning effort options', () => {
    it('includes Max and Ultra', () => {
        expect(CODEX_REASONING_EFFORT_OPTIONS).toEqual([
            { value: 'default', label: 'Default' },
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'xhigh', label: 'XHigh' },
            { value: 'max', label: 'Max' },
            { value: 'ultra', label: 'Ultra' },
        ])
    })
})
