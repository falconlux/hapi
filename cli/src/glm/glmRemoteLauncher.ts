import React from 'react'
import { randomUUID } from 'node:crypto'
import { logger } from '@/ui/logger'
import { convertAgentMessage } from '@/agent/messageConverter'
import type { AgentMessage } from '@/agent/types'
import { RemoteLauncherBase, type RemoteLauncherDisplayContext, type RemoteLauncherExitReason } from '@/modules/common/remote/RemoteLauncherBase'
import { GlmDisplay } from '@/ui/ink/GlmDisplay'
import type { GlmSession } from './session'
import type { OpenAIChatMessage, OpenAIStreamChunk } from './types'
import { resolveGlmConfig, type GlmRuntimeConfig } from './utils/config'

const GLM_SYSTEM_PROMPT = '你是一位经验丰富的软件工程师，擅长代码分析、调试和设计。直接给出答案，避免不必要的废话。代码用中文注释。'

class GlmRemoteLauncher extends RemoteLauncherBase {
    private readonly session: GlmSession
    private readonly initialModel?: string
    private abortController = new AbortController()
    private config: GlmRuntimeConfig

    constructor(session: GlmSession, opts: { model?: string }) {
        super(process.env.DEBUG ? session.logPath : undefined)
        this.session = session
        this.initialModel = opts.model
        this.config = resolveGlmConfig({ model: opts.model })
    }

    public async launch(): Promise<RemoteLauncherExitReason> {
        return this.start({
            onExit: () => this.handleExitFromUi(),
            onSwitchToLocal: () => this.handleExitFromUi()
        })
    }

    protected createDisplay(context: RemoteLauncherDisplayContext): React.ReactElement {
        return React.createElement(GlmDisplay, context)
    }

    protected async runMainLoop(): Promise<void> {
        const session = this.session
        const messageBuffer = this.messageBuffer

        messageBuffer.addMessage(`[MODEL:${this.config.model}]`, 'system')

        const history: OpenAIChatMessage[] = [
            { role: 'system', content: GLM_SYSTEM_PROMPT }
        ]

        const sessionId = randomUUID()
        session.onSessionFound(sessionId)

        this.setupAbortHandlers(session.client.rpcHandlerManager, {
            onAbort: () => this.handleAbort(),
            onSwitch: () => this.handleExitFromUi()
        })

        session.sendSessionEvent({ type: 'ready' })

        while (!this.shouldExit) {
            const batch = await session.queue.waitForMessagesAndGetAsString(this.abortController.signal)
            if (!batch) {
                if (this.abortController.signal.aborted && !this.shouldExit) {
                    this.abortController = new AbortController()
                    continue
                }
                break
            }

            // Apply model change if requested
            if (batch.mode.model && batch.mode.model !== this.config.model) {
                this.config.model = batch.mode.model
                messageBuffer.addMessage(`[MODEL:${this.config.model}]`, 'system')
            }

            history.push({ role: 'user', content: batch.message })
            messageBuffer.addMessage(batch.message, 'user')

            session.onThinkingChange(true)

            try {
                const response = await this.callApi(history)

                history.push({ role: 'assistant', content: response })

                this.handleAgentMessage({ type: 'text', text: response })
                this.handleAgentMessage({ type: 'turn_complete', stopReason: 'stop' })
                messageBuffer.addMessage(response, 'assistant')
            } catch (error) {
                if (this.abortController.signal.aborted) {
                    messageBuffer.addMessage('Turn aborted', 'status')
                    this.abortController = new AbortController()
                } else {
                    const msg = error instanceof Error ? error.message : String(error)
                    logger.warn('[glm] API call failed', { message: msg })
                    session.sendSessionEvent({ type: 'message', message: `GLM error: ${msg}` })
                    messageBuffer.addMessage(`Error: ${msg}`, 'status')
                }
            } finally {
                session.onThinkingChange(false)
                if (session.queue.size() === 0 && !this.shouldExit) {
                    session.sendSessionEvent({ type: 'ready' })
                }
            }
        }
    }

    protected async cleanup(): Promise<void> {
        this.clearAbortHandlers(this.session.client.rpcHandlerManager)
        this.abortController.abort()
    }

    private async callApi(messages: OpenAIChatMessage[]): Promise<string> {
        const response = await fetch(`${this.config.apiBase}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.config.model,
                messages,
                max_tokens: 8192,
                temperature: 0.3,
                stream: true,
            }),
            signal: this.abortController.signal,
        })

        if (!response.ok) {
            const text = await response.text()
            throw new Error(`GLM API ${response.status}: ${text.slice(0, 200)}`)
        }

        return this.readStream(response)
    }

    private async readStream(response: Response): Promise<string> {
        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let fullText = ''
        let buffer = ''

        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() ?? ''

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue
                    const data = line.slice(6).trim()
                    if (data === '[DONE]') continue

                    try {
                        const chunk = JSON.parse(data) as OpenAIStreamChunk
                        const content = chunk.choices[0]?.delta?.content ?? ''
                        if (content) fullText += content
                    } catch {
                        // ignore malformed SSE lines
                    }
                }
            }
        } finally {
            reader.releaseLock()
        }

        return fullText
    }

    private handleAgentMessage(message: AgentMessage): void {
        const converted = convertAgentMessage(message)
        if (converted) {
            this.session.sendAgentMessage(converted)
        }
    }

    private async handleAbort(): Promise<void> {
        this.abortController.abort()
        this.session.sendSessionEvent({ type: 'message', message: 'GLM turn aborted' })
        this.session.queue.reset()
        this.session.onThinkingChange(false)
    }

    private async handleExitFromUi(): Promise<void> {
        await this.requestExit('exit', () => this.handleAbort())
    }
}

export async function glmRemoteLauncher(
    session: GlmSession,
    opts: { model?: string }
): Promise<'switch' | 'exit'> {
    const launcher = new GlmRemoteLauncher(session, opts)
    return launcher.launch()
}
