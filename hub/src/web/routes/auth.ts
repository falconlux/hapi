import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { z } from 'zod'
import { configuration } from '../../configuration'
import { constantTimeEquals } from '../../utils/crypto'
import { parseAccessToken } from '../../utils/accessToken'
import { validateTelegramInitData } from '../telegramInitData'
import { getOrCreateOwnerId } from '../../config/ownerId'
import {
    getEntry as getPasswordEntry,
    ensureDefault as ensureDefaultPassword,
    verify as verifyPassword,
    changePassword
} from '../../config/passwordStore'
import type { WebAppEnv } from '../middleware/auth'
import type { Store } from '../../store'

const telegramAuthSchema = z.object({
    initData: z.string()
})

const accessTokenAuthSchema = z.object({
    accessToken: z.string(),
    password: z.string().optional()
})

const authBodySchema = z.union([telegramAuthSchema, accessTokenAuthSchema])

const changePasswordSchema = z.object({
    accessToken: z.string(),
    currentPassword: z.string(),
    newPassword: z.string().min(6)
})

export function createAuthRoutes(jwtSecret: Uint8Array, store: Store): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.post('/auth', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = authBodySchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        let userId: number
        let username: string | undefined
        let firstName: string | undefined
        let lastName: string | undefined
        let namespace: string
        let mustChange = false

        // Access Token authentication (CLI_API_TOKEN)
        if ('accessToken' in parsed.data) {
            const parsedToken = parseAccessToken(parsed.data.accessToken)
            if (!parsedToken) {
                return c.json({ error: 'Invalid access token' }, 401)
            }
            if (parsedToken.baseToken && !constantTimeEquals(parsedToken.baseToken, configuration.cliApiToken)) {
                return c.json({ error: 'Invalid access token' }, 401)
            }
            namespace = parsedToken.namespace

            // Password gate: only allow pre-created namespaces (no auto-seed).
            const entry = await getPasswordEntry(namespace)
            if (!entry) {
                return c.json({ error: 'User not found', userNotFound: true }, 401)
            }
            if (!parsed.data.password) {
                return c.json({ error: 'Password required', passwordRequired: true }, 401)
            }
            const result = await verifyPassword(namespace, parsed.data.password)
            if (!result.valid) {
                return c.json({ error: 'Invalid password', passwordRequired: true }, 401)
            }
            mustChange = result.mustChange

            userId = await getOrCreateOwnerId()
            firstName = 'Web User'
        } else {
            if (!configuration.telegramEnabled || !configuration.telegramBotToken) {
                return c.json({ error: 'Telegram authentication is disabled. Configure TELEGRAM_BOT_TOKEN.' }, 503)
            }

            // Telegram initData authentication
            const result = validateTelegramInitData(parsed.data.initData, configuration.telegramBotToken)
            if (!result.ok) {
                return c.json({ error: result.error }, 401)
            }

            const telegramUserId = String(result.user.id)
            const storedUser = store.users.getUser('telegram', telegramUserId)
            if (!storedUser) {
                return c.json({ error: 'not_bound' }, 401)
            }

            userId = await getOrCreateOwnerId()
            username = result.user.username
            firstName = result.user.first_name
            lastName = result.user.last_name
            namespace = storedUser.namespace
        }

        const token = await new SignJWT({ uid: userId, ns: namespace, mc: mustChange ? 1 : 0 })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('4h')
            .sign(jwtSecret)

        return c.json({
            token,
            mustChangePassword: mustChange,
            user: {
                id: userId,
                username,
                firstName,
                lastName
            }
        })
    })

    app.post('/auth/change-password', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = changePasswordSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const parsedToken = parseAccessToken(parsed.data.accessToken)
        if (!parsedToken || (parsedToken.baseToken && !constantTimeEquals(parsedToken.baseToken, configuration.cliApiToken))) {
            return c.json({ error: 'Invalid access token' }, 401)
        }
        const check = await verifyPassword(parsedToken.namespace, parsed.data.currentPassword)
        if (!check.valid) {
            return c.json({ error: 'Current password is incorrect' }, 401)
        }
        if (parsed.data.newPassword === parsed.data.currentPassword) {
            return c.json({ error: 'New password must differ from current password' }, 400)
        }
        await changePassword(parsedToken.namespace, parsed.data.newPassword)

        const userId = await getOrCreateOwnerId()
        const token = await new SignJWT({ uid: userId, ns: parsedToken.namespace, mc: 0 })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('15m')
            .sign(jwtSecret)

        return c.json({ success: true, token })
    })

    app.post('/auth/register', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = z.object({ accessToken: z.string() }).safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }
        const parsedToken = parseAccessToken(parsed.data.accessToken)
        if (!parsedToken || (parsedToken.baseToken && !constantTimeEquals(parsedToken.baseToken, configuration.cliApiToken))) {
            return c.json({ error: 'Invalid access token' }, 401)
        }
        const namespace = parsedToken.namespace
        const existing = await getPasswordEntry(namespace)
        if (existing) {
            return c.json({ error: 'User already exists', exists: true }, 409)
        }
        await ensureDefaultPassword(namespace)
        return c.json({ success: true, namespace, defaultPassword: true })
    })

    return app
}
