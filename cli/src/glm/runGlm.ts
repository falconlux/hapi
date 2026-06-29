import { logger } from '@/ui/logger'
import { glmLoop } from './loop'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { hashObject } from '@/utils/deterministicJson'
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler'
import type { GlmSession } from './session'
import type { GlmMode } from './types'
import { bootstrapSession } from '@/agent/sessionFactory'
import { createModeChangeHandler, createRunnerLifecycle, setControlledByUser } from '@/agent/runnerLifecycle'
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter'
import { getInvokedCwd } from '@/utils/invokedCwd'
import { DEFAULT_GLM_MODEL } from './utils/config'

export async function runGlm(opts: {
    startedBy?: 'runner' | 'terminal'
    model?: string
    resumeSessionId?: string
} = {}): Promise<void> {
    const workingDirectory = getInvokedCwd()
    const startedBy = opts.startedBy ?? 'terminal'

    logger.debug(`[glm] Starting with options: startedBy=${startedBy}, model=${opts.model}`)

    const { api, session } = await bootstrapSession({
        flavor: 'glm',
        startedBy,
        workingDirectory,
        model: opts.model
    })

    setControlledByUser(session, 'remote')

    const messageQueue = new MessageQueue2<GlmMode>((mode) => hashObject({
        model: mode.model
    }))

    const sessionWrapperRef: { current: GlmSession | null } = { current: null }
    let sessionModel: string | null = opts.model ?? null
    let resolvedModel = sessionModel ?? DEFAULT_GLM_MODEL

    const lifecycle = createRunnerLifecycle({
        session,
        logTag: 'glm',
        stopKeepAlive: () => sessionWrapperRef.current?.stopKeepAlive(),
        onAfterClose: () => {}
    })

    lifecycle.registerProcessHandlers()
    registerKillSessionHandler(session.rpcHandlerManager, lifecycle.cleanupAndExit)

    const syncSessionModel = () => {
        const instance = sessionWrapperRef.current
        if (!instance) return
        instance.setModel(sessionModel)
        instance.pushKeepAlive()
    }

    session.onUserMessage((message, localId) => {
        const formattedText = formatMessageWithAttachments(message.content.text, message.content.attachments)
        const mode: GlmMode = { model: resolvedModel }
        messageQueue.push(formattedText, mode, localId)
    })

    session.onCancelQueuedMessage((localId) => {
        const removed = messageQueue.cancelByLocalId(localId)
        logger.debug(`[glm] cancelByLocalId(${localId}): ${removed ? 'removed' : 'not found'}`)
        return removed
    })

    session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid session config payload')
        }
        const config = payload as { model?: unknown }
        const applied: Record<string, unknown> = {}

        if (config.model !== undefined) {
            if (config.model === null) {
                sessionModel = null
            } else if (typeof config.model === 'string' && config.model.trim().length > 0) {
                sessionModel = config.model.trim()
            } else {
                throw new Error('Invalid model')
            }
            resolvedModel = sessionModel ?? DEFAULT_GLM_MODEL
            applied.model = sessionModel
        }

        syncSessionModel()
        return { applied }
    })

    let crashed = false

    try {
        await glmLoop({
            path: workingDirectory,
            messageQueue,
            session,
            api,
            model: resolvedModel,
            resumeSessionId: opts.resumeSessionId,
            onModeChange: createModeChangeHandler(session),
            onSessionReady: (instance) => {
                sessionWrapperRef.current = instance
                syncSessionModel()
            }
        })
    } catch (error) {
        crashed = true
        lifecycle.markCrash(error)
        logger.debug('[glm] Loop error:', error)
    } finally {
        if (!crashed) {
            lifecycle.setSessionEndReason('completed')
        }
        await lifecycle.cleanupAndExit()
    }
}
