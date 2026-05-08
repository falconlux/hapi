import { Hono } from 'hono'
import type { WebAppEnv } from '../middleware/auth'
import type { SyncEngine } from '../../sync/syncEngine'

export interface UsageData {
    five_hour: { utilization: number; resets_at: string } | null
    seven_day: { utilization: number; resets_at: string } | null
    seven_day_opus: { utilization: number; resets_at: string } | null
    seven_day_sonnet: { utilization: number; resets_at: string } | null
    extra_usage: {
        is_enabled: boolean
        monthly_limit: number | null
        used_credits: number | null
        utilization: number | null
    } | null
    subscriptionType?: string
    rateLimitTier?: string
}

type CachedUsageEntry = {
    data: UsageData
    timestamp: number
}

// Cache usage data to avoid rate limiting (endpoint allows ~5 requests per token)
const cachedUsageByNamespace = new Map<string, CachedUsageEntry>()
const CACHE_TTL = 120_000 // 2 minutes

async function fetchUsageViaRpc(getSyncEngine: () => SyncEngine | null, namespace: string): Promise<UsageData | null> {
    const now = Date.now()
    const cachedEntry = cachedUsageByNamespace.get(namespace)
    if (cachedEntry && (now - cachedEntry.timestamp) < CACHE_TTL) {
        return cachedEntry.data
    }

    const syncEngine = getSyncEngine()
    if (!syncEngine) return cachedEntry?.data ?? null

    try {
        const data = await syncEngine.getUsage(namespace) as UsageData | null
        if (data) {
            cachedUsageByNamespace.set(namespace, {
                data,
                timestamp: now
            })
        }
        return data ?? cachedEntry?.data ?? null
    } catch {
        return cachedEntry?.data ?? null
    }
}

interface CswapAccount {
    idx: number
    email: string
    isActive: boolean
    fiveHourPct: number | null
    fiveHourResets: string | null
    sevenDayPct: number | null
    sevenDayResets: string | null
}

const cachedCswapByNamespace = new Map<string, { data: { accounts: CswapAccount[] }; timestamp: number }>()
const CSWAP_CACHE_TTL = 60_000 // 1 min

async function fetchCswapViaRpc(getSyncEngine: () => SyncEngine | null, namespace: string) {
    const now = Date.now()
    const cached = cachedCswapByNamespace.get(namespace)
    if (cached && (now - cached.timestamp) < CSWAP_CACHE_TTL) return cached.data
    const syncEngine = getSyncEngine()
    if (!syncEngine) return cached?.data ?? null
    try {
        const data = await syncEngine.getCswapAccounts(namespace) as { accounts: CswapAccount[] } | null
        if (data?.accounts?.length) {
            cachedCswapByNamespace.set(namespace, { data, timestamp: now })
        }
        return data ?? cached?.data ?? null
    } catch {
        return cached?.data ?? null
    }
}

export function createUsageRoutes(getSyncEngine: () => SyncEngine | null) {
    const app = new Hono<WebAppEnv>()

    app.get('/usage', async (c) => {
        const usage = await fetchUsageViaRpc(getSyncEngine, c.get('namespace'))
        if (!usage) {
            return c.json({ error: 'Unable to fetch usage data' }, 503)
        }
        return c.json(usage)
    })

    app.get('/usage/accounts', async (c) => {
        const data = await fetchCswapViaRpc(getSyncEngine, c.get('namespace'))
        if (!data) return c.json({ accounts: [] })
        return c.json(data)
    })

    app.post('/usage/accounts/switch', async (c) => {
        const body = await c.req.json().catch(() => null)
        const idx = body?.idx
        if (typeof idx !== 'number' || idx < 1) {
            return c.json({ success: false, error: 'Invalid idx' }, 400)
        }
        const syncEngine = getSyncEngine()
        if (!syncEngine) {
            return c.json({ success: false, error: 'No sync engine' }, 503)
        }
        const result = await syncEngine.switchCswapAccount(c.get('namespace'), idx) as { success: boolean; error?: string }
        cachedCswapByNamespace.delete(c.get('namespace'))
        return c.json(result, result.success ? 200 : 500)
    })

    return app
}
