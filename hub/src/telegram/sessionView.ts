/**
 * Session Notification View for Telegram
 *
 * Provides notification formatting for permission requests.
 * All interactive session views are handled by the Telegram Mini App.
 */

import { InlineKeyboard } from 'grammy'
import type { Session } from '../sync/syncEngine'
import { ACTIONS } from './callbacks'
import { createCallbackData, truncate, getSessionName } from './renderer'

const MAX_TOOL_ARGS_LENGTH = 150
const MAX_QUESTION_TOOL_ARGS_LENGTH = 500

/**
 * Format a compact session notification for permission requests
 */
export function formatSessionNotification(session: Session): string {
    const name = getSessionName(session)
    const lines: string[] = ['Permission Request', '', `Session: ${name}`]

    const requests = session.agentState?.requests
    if (requests) {
        const reqId = Object.keys(requests)[0]
        const req = requests[reqId]
        if (req) {
            lines.push(`Tool: ${req.tool}`)
            const args = formatToolArgumentsDetailed(req.tool, req.arguments)
            if (args) {
                lines.push(args)
            }
        }
    }

    return lines.join('\n')
}

/**
 * Create notification keyboard for quick actions
 */
export function createNotificationKeyboard(session: Session, publicUrl: string): InlineKeyboard {
    const keyboard = new InlineKeyboard()
    const requests = session.agentState?.requests ?? null
    const hasRequests = Boolean(requests && Object.keys(requests).length > 0)
    const canControl = session.active

    if (canControl && hasRequests) {
        const requestId = Object.keys(requests!)[0]
        const reqPrefix = requestId.slice(0, 8)

        keyboard
            .text('Allow', createCallbackData(ACTIONS.APPROVE, session.id, reqPrefix))
            .text('Deny', createCallbackData(ACTIONS.DENY, session.id, reqPrefix))
        keyboard.row()

        keyboard.webApp(
            'Details',
            buildMiniAppDeepLink(publicUrl, `session_${session.id}`)
        )
        return keyboard
    }

    keyboard.webApp(
        'Open Session',
        buildMiniAppDeepLink(publicUrl, `session_${session.id}`)
    )
    return keyboard
}

/**
 * Format detailed tool arguments for notification display
 */
function formatToolArgumentsDetailed(tool: string, args: any): string {
    if (!args) return ''

    try {
        switch (tool) {
            case 'Edit': {
                const file = args.file_path || args.path || 'unknown'
                const oldStr = args.old_string ? truncate(args.old_string, 50) : ''
                const newStr = args.new_string ? truncate(args.new_string, 50) : ''
                let result = `File: ${truncate(file, MAX_TOOL_ARGS_LENGTH)}`
                if (oldStr) result += `\nOld: "${oldStr}"`
                if (newStr) result += `\nNew: "${newStr}"`
                return result
            }

            case 'Write': {
                const file = args.file_path || args.path || 'unknown'
                const content = args.content ? `${args.content.length} chars` : ''
                return `File: ${truncate(file, MAX_TOOL_ARGS_LENGTH)}${content ? ` (${content})` : ''}`
            }

            case 'Read': {
                const file = args.file_path || args.path || 'unknown'
                return `File: ${truncate(file, MAX_TOOL_ARGS_LENGTH)}`
            }

            case 'Bash': {
                const cmd = args.command || ''
                return `Command: ${truncate(cmd, MAX_TOOL_ARGS_LENGTH)}`
            }

            case 'Agent':
            case 'Task': {
                const desc = args.description || args.prompt || ''
                return `Task: ${truncate(desc, MAX_TOOL_ARGS_LENGTH)}`
            }

            case 'Grep':
            case 'Glob': {
                const pattern = args.pattern || ''
                const path = args.path || ''
                let result = `Pattern: ${pattern}`
                if (path) result += `\nPath: ${truncate(path, 80)}`
                return result
            }

            case 'WebFetch': {
                const url = args.url || ''
                return `URL: ${truncate(url, MAX_TOOL_ARGS_LENGTH)}`
            }

            case 'TodoWrite': {
                const count = args.todos?.length || 0
                return `Updating ${count} todo items`
            }

            case 'AskUserQuestion':
            case 'AskUserQuestionTool': {
                return formatAskUserQuestionArguments(args)
            }

            default: {
                // Generic args display for unknown tools
                const argStr = JSON.stringify(args)
                if (argStr.length > 10) {
                    return `Args: ${truncate(argStr, MAX_TOOL_ARGS_LENGTH)}`
                }
                return ''
            }
        }
    } catch {
        return ''
    }
}

function formatAskUserQuestionArguments(args: unknown): string {
    if (!args || typeof args !== 'object' || !('questions' in args)) return ''

    const questions = (args as { questions?: unknown }).questions
    if (!Array.isArray(questions)) return ''

    const blocks = questions
        .map((question) => {
            if (!question || typeof question !== 'object') return ''

            const questionData = question as {
                question?: unknown
                header?: unknown
                options?: unknown
            }

            const questionText = typeof questionData.question === 'string'
                ? questionData.question.trim()
                : ''
            const header = typeof questionData.header === 'string'
                ? questionData.header.trim()
                : ''
            const options = Array.isArray(questionData.options)
                ? questionData.options
                    .map((option) => {
                        if (!option || typeof option !== 'object') return ''
                        const label = (option as { label?: unknown }).label
                        return typeof label === 'string' ? label.trim() : ''
                    })
                    .filter(Boolean)
                : []

            const lines: string[] = []
            if (questionText) lines.push(`❓ ${questionText}`)
            if (header) lines.push(`${header}:`)
            lines.push(...options.map((label) => `• ${label}`))

            return lines.join('\n')
        })
        .filter(Boolean)

    return truncate(blocks.join('\n\n'), MAX_QUESTION_TOOL_ARGS_LENGTH)
}

function buildMiniAppDeepLink(baseUrl: string, startParam: string): string {
    try {
        const url = new URL(baseUrl)
        url.searchParams.set('startapp', startParam)
        return url.toString()
    } catch {
        const separator = baseUrl.includes('?') ? '&' : '?'
        return `${baseUrl}${separator}startapp=${encodeURIComponent(startParam)}`
    }
}
