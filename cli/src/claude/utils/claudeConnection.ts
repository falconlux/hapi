import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { logger } from '@/ui/logger'

function connectionFile(): string {
    return process.env.HAPI_CONNECTION_FILE || join(homedir(), '.hapi-connection.json')
}

interface NewapiChannelConn { _type: 'newapi_channel_conn'; url: string; key: string }
// glm_channel_conn: routes through newapi but defaults to a GLM model.
// model field is optional; if set it becomes the default when no model is chosen in the session.
interface GlmChannelConn { _type: 'glm_channel_conn'; url: string; key: string; model?: string }

type ChannelConn = NewapiChannelConn | GlmChannelConn

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

function readConn(): Partial<ChannelConn> | null {
    try {
        const raw = readFileSync(connectionFile(), 'utf-8')
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed as Partial<ChannelConn> : null
    } catch {
        return null
    }
}

export function currentConnectionFingerprint(): string {
    try {
        return readFileSync(connectionFile(), 'utf-8').trim()
    } catch {
        return 'oauth'
    }
}

/**
 * If the active connection is glm_channel_conn and has a model field, return it.
 * Called by claudeRemote to apply a default model when none is set in the session.
 */
export function getConnectionModelOverride(): string | undefined {
    const conn = readConn()
    if (conn?._type === 'glm_channel_conn' && typeof conn.model === 'string' && conn.model) {
        return conn.model
    }
    return undefined
}

/**
 * Apply the current Claude connection to process.env before a session query.
 * - newapi_channel_conn {url,key} -> route Claude through the newapi gateway.
 * - glm_channel_conn {url,key,model?} -> same routing but defaults to a GLM model.
 *   newapi.1to10.cn speaks the Anthropic Messages API and proxies to GLM/other models.
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

    let conn: Partial<ChannelConn> | null = null
    try {
        conn = JSON.parse(raw)
    } catch {
        logger.warn(`[claudeConnection] ${file} is not valid JSON; falling back to OAuth`)
        useOAuth()
        return
    }

    if (conn && (conn._type === 'newapi_channel_conn' || conn._type === 'glm_channel_conn')) {
        if (typeof conn.url === 'string' && conn.url && typeof conn.key === 'string' && conn.key) {
            process.env.ANTHROPIC_BASE_URL = conn.url
            process.env.ANTHROPIC_AUTH_TOKEN = conn.key
            logger.debug(`[claudeConnection] using ${conn._type} gateway: ${conn.url}`)
            return
        }
        logger.warn(`[claudeConnection] ${file} is ${conn._type} but missing url/key; falling back to OAuth`)
    }

    // Non-gateway type / partial config -> OAuth.
    useOAuth()
}
