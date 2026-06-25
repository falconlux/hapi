import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { logger } from '@/ui/logger'

function connectionFile(): string {
    return process.env.HAPI_CONNECTION_FILE || join(homedir(), '.hapi-connection.json')
}

interface NewapiChannelConn { _type: 'newapi_channel_conn'; url: string; key: string }

// Capture the daemon's original Claude-connection env at module load (reflects the
// launchd/parent env before any session runs). When we fall back to OAuth we RESTORE
// these instead of unconditionally deleting, so we never clobber a value that some
// other mechanism (e.g. a runner plist) intentionally set.
const ORIGINAL_BASE_URL = process.env.ANTHROPIC_BASE_URL
const ORIGINAL_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN

function restoreEnv(key: string, original: string | undefined): void {
    if (original === undefined) {
        delete process.env[key]
    } else {
        process.env[key] = original
    }
}

function useOAuth(): void {
    restoreEnv('ANTHROPIC_BASE_URL', ORIGINAL_BASE_URL)
    restoreEnv('ANTHROPIC_AUTH_TOKEN', ORIGINAL_AUTH_TOKEN)
}

export function currentConnectionFingerprint(): string {
    try {
        return readFileSync(connectionFile(), 'utf-8').trim()
    } catch {
        return 'oauth'
    }
}

/**
 * Apply the current Claude connection to process.env before a session query.
 * - newapi_channel_conn {url,key} -> route Claude through the gateway.
 * - file absent -> OAuth (the normal default), silently.
 * - file present but invalid JSON / missing url|key -> OAuth + a WARNING, so a broken
 *   gateway file does not silently keep you on an exhausted OAuth account.
 * Read per session spawn so switching takes effect on new conversations without a daemon restart.
 */
export function applyClaudeConnection(): void {
    const file = connectionFile()

    let raw: string
    try {
        raw = readFileSync(file, 'utf-8')
    } catch {
        // Absent file => OAuth, no warning (the normal default state).
        useOAuth()
        return
    }

    let conn: Partial<NewapiChannelConn> | null = null
    try {
        conn = JSON.parse(raw)
    } catch {
        logger.warn(`[claudeConnection] ${file} is not valid JSON; falling back to OAuth`)
        useOAuth()
        return
    }

    if (conn && conn._type === 'newapi_channel_conn') {
        if (typeof conn.url === 'string' && conn.url && typeof conn.key === 'string' && conn.key) {
            process.env.ANTHROPIC_BASE_URL = conn.url
            process.env.ANTHROPIC_AUTH_TOKEN = conn.key
            logger.debug(`[claudeConnection] using newapi gateway: ${conn.url}`)
            return
        }
        logger.warn(`[claudeConnection] ${file} is newapi_channel_conn but missing url/key; falling back to OAuth`)
    }

    // Non-gateway type / partial config -> OAuth.
    useOAuth()
}
