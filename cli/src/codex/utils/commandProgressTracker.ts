import {
    withHapiCommandProgress,
    type HapiCommandProgress
} from '@hapi/protocol'

type ActiveCommand = {
    input: Record<string, unknown>
    outputTail: string
    outputChars: number
    lastEmittedAt: number
    timer: ReturnType<typeof setTimeout> | null
}

type CommandProgressTrackerOptions = {
    maxTailChars?: number
    throttleMs?: number
    now?: () => number
}

const DEFAULT_MAX_TAIL_CHARS = 8_000
const DEFAULT_THROTTLE_MS = 500

function normalizeOutputDelta(delta: string): string {
    return delta
        .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
        .replace(/\r(?!\n)/g, '\n')
}

export class CommandProgressTracker {
    private readonly commands = new Map<string, ActiveCommand>()
    private readonly maxTailChars: number
    private readonly throttleMs: number
    private readonly now: () => number

    constructor(
        private readonly onProgress: (callId: string, input: Record<string, unknown>) => void,
        options: CommandProgressTrackerOptions = {}
    ) {
        this.maxTailChars = options.maxTailChars ?? DEFAULT_MAX_TAIL_CHARS
        this.throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS
        this.now = options.now ?? Date.now
    }

    start(callId: string, input: Record<string, unknown>): Record<string, unknown> {
        this.finish(callId)
        const command: ActiveCommand = {
            input,
            outputTail: '',
            outputChars: 0,
            lastEmittedAt: 0,
            timer: null
        }
        this.commands.set(callId, command)
        return this.buildInput(command)
    }

    append(callId: string, rawDelta: string): void {
        const delta = normalizeOutputDelta(rawDelta)
        if (!delta) return

        const command = this.commands.get(callId)
        if (!command) return

        command.outputChars += delta.length
        command.outputTail = `${command.outputTail}${delta}`.slice(-this.maxTailChars)

        const now = this.now()
        if (command.lastEmittedAt === 0 || now - command.lastEmittedAt >= this.throttleMs) {
            this.emit(callId, command, now)
            return
        }

        if (command.timer) return
        const delay = Math.max(0, this.throttleMs - (now - command.lastEmittedAt))
        command.timer = setTimeout(() => {
            command.timer = null
            if (this.commands.get(callId) !== command) return
            this.emit(callId, command, this.now())
        }, delay)
        command.timer.unref?.()
    }

    finish(callId: string): void {
        const command = this.commands.get(callId)
        if (!command) return
        if (command.timer) {
            clearTimeout(command.timer)
        }
        this.commands.delete(callId)
    }

    reset(): void {
        for (const callId of this.commands.keys()) {
            this.finish(callId)
        }
    }

    private emit(callId: string, command: ActiveCommand, now: number): void {
        command.lastEmittedAt = now
        this.onProgress(callId, this.buildInput(command))
    }

    private buildInput(command: ActiveCommand): Record<string, unknown> {
        const progress: HapiCommandProgress = {
            status: 'running',
            outputTail: command.outputTail,
            outputChars: command.outputChars,
            truncated: command.outputChars > command.outputTail.length
        }
        return withHapiCommandProgress(command.input, progress)
    }
}
