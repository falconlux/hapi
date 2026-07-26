import { describe, expect, it } from 'vitest'
import {
    HAPI_COMMAND_PROGRESS_FIELD,
    getHapiCommandProgress,
    withHapiCommandProgress
} from './commandProgress'

describe('command progress', () => {
    it('attaches and parses a running command preview without replacing tool input', () => {
        const input = withHapiCommandProgress({ command: 'bun test' }, {
            status: 'running',
            outputTail: '12 tests passed\n',
            outputChars: 16,
            truncated: false
        })

        expect(input.command).toBe('bun test')
        expect(getHapiCommandProgress(input)).toEqual({
            status: 'running',
            outputTail: '12 tests passed\n',
            outputChars: 16,
            truncated: false
        })
    })

    it('rejects unrelated internal metadata', () => {
        expect(getHapiCommandProgress({
            [HAPI_COMMAND_PROGRESS_FIELD]: { status: 'completed' }
        })).toBeNull()
    })
})
