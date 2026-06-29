import { MessageQueue2 } from '@/utils/MessageQueue2'
import { logger } from '@/ui/logger'
import { runLocalRemoteSession } from '@/agent/loopBase'
import { GlmSession } from './session'
import { glmRemoteLauncher } from './glmRemoteLauncher'
import { ApiClient, ApiSessionClient } from '@/lib'
import type { GlmMode } from './types'

interface GlmLoopOptions {
    path: string
    onModeChange: (mode: 'local' | 'remote') => void
    messageQueue: MessageQueue2<GlmMode>
    session: ApiSessionClient
    api: ApiClient
    model?: string
    resumeSessionId?: string
    onSessionReady?: (session: GlmSession) => void
}

export async function glmLoop(opts: GlmLoopOptions): Promise<void> {
    const logPath = logger.getLogPath()

    const session = new GlmSession({
        api: opts.api,
        client: opts.session,
        path: opts.path,
        sessionId: opts.resumeSessionId ?? null,
        logPath,
        messageQueue: opts.messageQueue,
        onModeChange: opts.onModeChange,
        mode: 'remote',
        startedBy: 'runner',
        startingMode: 'remote',
    })

    if (opts.resumeSessionId) {
        session.onSessionFound(opts.resumeSessionId)
    }

    const getCurrentModel = (): string | undefined => {
        const m = session.getModel()
        return m != null ? m : opts.model
    }

    await runLocalRemoteSession({
        session,
        startingMode: 'remote',
        logTag: 'glm-loop',
        runLocal: async (_instance) => 'exit',
        runRemote: (instance) => glmRemoteLauncher(instance, {
            model: getCurrentModel(),
            resumeSessionId: opts.resumeSessionId
        }),
        onSessionReady: opts.onSessionReady
    })
}
