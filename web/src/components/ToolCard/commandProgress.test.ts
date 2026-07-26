import { describe, expect, it } from 'vitest'
import { withHapiCommandProgress } from '@hapi/protocol'
import { formatLiveCommandOutput, getLiveCommandProgress } from './commandProgress'

describe('command progress presentation', () => {
    it('reads CLI live output metadata', () => {
        const input = withHapiCommandProgress({ command: 'bun test' }, {
            status: 'running',
            outputTail: 'running suite\n',
            outputChars: 14,
            truncated: false
        })

        expect(getLiveCommandProgress(input)?.outputTail).toBe('running suite\n')
    })

    it('keeps the most recent output lines for a compact mobile preview', () => {
        expect(formatLiveCommandOutput('one\ntwo\nthree\nfour\n', 2, 100)).toEqual({
            text: '…\nthree\nfour',
            clipped: true
        })
    })
})
