import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { logger } from '@/ui/logger'

function connectionFile(): string {
    return process.env.HAPI_CONNECTION_FILE || join(homedir(), '.hapi-connection.json')
}

interface NewapiChannelConn { _type: 'newapi_channel_conn'; url: string; key: string }

/**
 * Apply the current Claude connection to process.env before a session query.
 * newapi_channel_conn -> set ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN (use gateway).
 * missing/other -> clear them (fall back to default OAuth account in keychain).
 * Read per session spawn so switching takes effect on new conversations without a daemon restart.
 */
export function applyClaudeConnection(): void {
    let conn: Partial<NewapiChannelConn> | null = null
    try {
        conn = JSON.parse(readFileSync(connectionFile(), 'utf-8'))
    } catch {
        conn = null
    }
    if (conn && conn._type === 'newapi_channel_conn' && typeof conn.url === 'string' && typeof conn.key === 'string') {
        process.env.ANTHROPIC_BASE_URL = conn.url
        process.env.ANTHROPIC_AUTH_TOKEN = conn.key
        logger.debug(`[claudeConnection] using newapi gateway: ${conn.url}`)
    } else {
        delete process.env.ANTHROPIC_BASE_URL
        delete process.env.ANTHROPIC_AUTH_TOKEN
    }
}
