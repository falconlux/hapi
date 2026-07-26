import { afterEach, describe, expect, it, vi } from 'vitest'
import { getHapiCommandProgress } from '@hapi/protocol'
import { CommandProgressTracker } from './commandProgressTracker'

describe('CommandProgressTracker', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('emits the first output immediately and throttles later updates', () => {
        vi.useFakeTimers()
        let now = 1_000
        const updates: Array<{ callId: string; input: Record<string, unknown> }> = []
        const tracker = new CommandProgressTracker((callId, input) => {
            updates.push({ callId, input })
        }, { now: () => now, throttleMs: 500 })

        const initial = tracker.start('cmd-1', { command: 'bun test' })
        expect(getHapiCommandProgress(initial)?.outputTail).toBe('')

        tracker.append('cmd-1', 'first\n')
        tracker.append('cmd-1', 'second\n')
        expect(updates).toHaveLength(1)
        expect(getHapiCommandProgress(updates[0]?.input)?.outputTail).toBe('first\n')

        now += 500
        vi.advanceTimersByTime(500)
        expect(updates).toHaveLength(2)
        expect(getHapiCommandProgress(updates[1]?.input)?.outputTail).toBe('first\nsecond\n')
    })

    it('keeps only the latest output tail and clears pending timers on finish', () => {
        vi.useFakeTimers()
        let now = 1_000
        const updates: Record<string, unknown>[] = []
        const tracker = new CommandProgressTracker((_callId, input) => {
            updates.push(input)
        }, { now: () => now, maxTailChars: 5, throttleMs: 500 })

        tracker.start('cmd-1', { command: 'printf' })
        tracker.append('cmd-1', '123456')
        expect(getHapiCommandProgress(updates[0])!).toEqual(expect.objectContaining({
            outputTail: '23456',
            outputChars: 6,
            truncated: true
        }))

        tracker.append('cmd-1', '7')
        tracker.finish('cmd-1')
        now += 500
        vi.advanceTimersByTime(500)
        expect(updates).toHaveLength(1)
    })
})
