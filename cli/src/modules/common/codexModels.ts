import type { CodexModelsResponse, CodexModelSummary } from '@hapi/protocol/apiTypes';
import { CodexAppServerClient } from '@/codex/codexAppServerClient';
import { getErrorMessage } from './rpcResponses';

export interface ListCodexModelsRequest {
    includeHidden?: boolean;
}

export type ListCodexModelsResponse = CodexModelsResponse;

const CACHE_TTL_MS = 10_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 150;
const ATTEMPT_TIMEOUT_MS = 15_000;
const STDERR_TAIL_LIMIT = 2_000;
const SQLITE_STATE_UNAVAILABLE_REASON = 'Codex state database was temporarily unavailable';
const SQLITE_STATE_INIT_PATTERN = /failed to initialize sqlite state runtime/iu;
const TRANSIENT_SPAWN_CODES = new Set(['EAGAIN', 'EMFILE', 'ENFILE', 'ENOMEM']);

type CacheEntry = { expiresAt: number; models: CodexModelSummary[] };
const cache = new Map<boolean, CacheEntry>();
const inFlight = new Map<boolean, Promise<CodexModelSummary[]>>();
let retryBaseDelayMs = RETRY_BASE_DELAY_MS;
let attemptTimeoutMs = ATTEMPT_TIMEOUT_MS;
let retryRandom = Math.random;

function asNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeSupportedReasoningEfforts(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const efforts = value
        .map((entry) => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }
            const reasoningEffort = asNonEmptyString((entry as { reasoningEffort?: unknown }).reasoningEffort);
            return reasoningEffort;
        })
        .filter((entry): entry is string => entry !== null);

    return efforts.length > 0 ? efforts : undefined;
}

// The Codex model catalog advertises which service tiers are available for a
// model in the *current* account/auth context — e.g. an API-key session or a
// plan without Fast credits simply won't list a Fast tier. We surface the tier
// id AND display name as lowercased search tokens so the web can gate the
// Fast-mode toggle on real availability. The Fast tier's catalog id is
// `'priority'` but its name is `'Fast'`, so capturing the name is what lets a
// `/fast/i` match recognise it. (See OpenAI Codex speed docs: Fast maps to the
// request value `priority`.)
function normalizeServiceTiers(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const tokens = new Set<string>();
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const record = entry as { id?: unknown; name?: unknown };
        const id = asNonEmptyString(record.id);
        const name = asNonEmptyString(record.name);
        if (id) tokens.add(id.toLowerCase());
        if (name) tokens.add(name.toLowerCase());
    }

    return tokens.size > 0 ? [...tokens] : undefined;
}

function normalizeModel(entry: unknown): CodexModelSummary | null {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const record = entry as Record<string, unknown>;
    const id = asNonEmptyString(record.id) ?? asNonEmptyString(record.model);
    if (!id) {
        return null;
    }

    return {
        id,
        displayName: asNonEmptyString(record.displayName) ?? id,
        isDefault: record.isDefault === true,
        defaultReasoningEffort: asNonEmptyString(record.defaultReasoningEffort),
        supportedReasoningEfforts: normalizeSupportedReasoningEfforts(record.supportedReasoningEfforts),
        serviceTiers: normalizeServiceTiers(record.serviceTiers)
    };
}

function getErrorCode(error: unknown): string | null {
    if (!error || typeof error !== 'object') return null;
    const record = error as { code?: unknown; cause?: unknown };
    if (typeof record.code === 'string') return record.code;
    return getErrorCode(record.cause);
}

function isTransientSpawnResourceError(error: unknown): boolean {
    const code = getErrorCode(error);
    return code !== null && TRANSIENT_SPAWN_CODES.has(code);
}

function retryDelay(attempt: number): number {
    const jitter = 0.8 + retryRandom() * 0.4;
    return Math.round(retryBaseDelayMs * (2 ** (attempt - 1)) * jitter);
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAttempt(
    client: CodexAppServerClient,
    includeHidden: boolean,
    setPhase: (phase: 'initialize' | 'list') => void
): Promise<unknown[]> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const operation = (async () => {
        await client.connect();
        setPhase('initialize');
        await client.initialize({
            clientInfo: { name: 'hapi-codex-models', version: '1.0.0' },
            capabilities: { experimentalApi: true }
        });
        setPhase('list');
        const response = await client.listModels({ includeHidden });
        return Array.isArray(response.data) ? response.data : [];
    })();
    const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            timedOut = true;
            void client.disconnect().catch(() => undefined);
            reject(new Error('Timed out while listing Codex models'));
        }, attemptTimeoutMs);
    });

    try {
        return await Promise.race([operation, timeout]);
    } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        if (timedOut) void operation.catch(() => undefined);
    }
}

async function loadCodexModels(includeHidden: boolean): Promise<CodexModelSummary[]> {
    let lastError: unknown;
    let lastFailureWasSqlite = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const deadline = Date.now() + attemptTimeoutMs;
        const client = new CodexAppServerClient();
        let stderrTail = '';
        let shouldRetry = false;
        const state: { phase: 'connect' | 'initialize' | 'list' } = { phase: 'connect' };
        client.setStderrHandler((text) => {
            stderrTail = `${stderrTail}\n${text}`.slice(-STDERR_TAIL_LIMIT);
        });

        try {
            const data = await runAttempt(client, includeHidden, (nextPhase) => { state.phase = nextPhase; });
            return data.map(normalizeModel).filter((model): model is CodexModelSummary => model !== null);
        } catch (error) {
            lastError = error;
            const sqliteInitFailure = state.phase === 'initialize' && SQLITE_STATE_INIT_PATTERN.test(stderrTail);
            lastFailureWasSqlite = sqliteInitFailure;
            shouldRetry = attempt < MAX_ATTEMPTS
                && (sqliteInitFailure || (state.phase === 'connect' && isTransientSpawnResourceError(error)));
        } finally {
            client.setStderrHandler(null);
            const disconnect = client.disconnect().catch(() => undefined);
            const cleanupTimeLeft = Math.max(0, deadline - Date.now());
            if (cleanupTimeLeft > 0) {
                await Promise.race([disconnect, wait(cleanupTimeLeft)]);
            }
        }

        if (!shouldRetry) break;
        await wait(retryDelay(attempt));
    }

    if (lastFailureWasSqlite) throw new Error(SQLITE_STATE_UNAVAILABLE_REASON);
    const message = getErrorMessage(lastError, 'Failed to list Codex models');
    throw new Error(message);
}

export async function listCodexModels(includeHidden: boolean = false): Promise<CodexModelSummary[]> {
    const cached = cache.get(includeHidden);
    if (cached && cached.expiresAt > Date.now()) return cached.models;

    const existing = inFlight.get(includeHidden);
    if (existing) return existing;

    const request = loadCodexModels(includeHidden)
        .then((models) => {
            cache.set(includeHidden, { expiresAt: Date.now() + CACHE_TTL_MS, models });
            return models;
        })
        .finally(() => inFlight.delete(includeHidden));
    inFlight.set(includeHidden, request);
    return request;
}

export function _resetCodexModelsForTests(options?: {
    retryBaseDelayMs?: number;
    attemptTimeoutMs?: number;
    retryRandom?: () => number;
}): void {
    cache.clear();
    inFlight.clear();
    retryBaseDelayMs = options?.retryBaseDelayMs ?? RETRY_BASE_DELAY_MS;
    attemptTimeoutMs = options?.attemptTimeoutMs ?? ATTEMPT_TIMEOUT_MS;
    retryRandom = options?.retryRandom ?? Math.random;
}
