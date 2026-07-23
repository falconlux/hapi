import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    type Attempt = {
        initializeError?: Error;
        initializeStderr?: string;
        initializeGate?: Promise<void>;
        listError?: Error;
        data?: unknown[];
    };
    const attempts: Attempt[] = [];
    const clients: MockClient[] = [];

    class MockClient {
        private readonly attempt: Attempt;
        private stderrHandler: ((text: string) => void) | null = null;
        readonly disconnect = vi.fn(async () => undefined);

        constructor() {
            const attempt = attempts.shift();
            if (!attempt) throw new Error('Missing test attempt');
            this.attempt = attempt;
            clients.push(this);
        }

        setStderrHandler(handler: ((text: string) => void) | null): void {
            this.stderrHandler = handler;
        }

        async connect(): Promise<void> {}

        async initialize(): Promise<void> {
            if (this.attempt.initializeStderr) this.stderrHandler?.(this.attempt.initializeStderr);
            if (this.attempt.initializeGate) await this.attempt.initializeGate;
            if (this.attempt.initializeError) throw this.attempt.initializeError;
        }

        async listModels(): Promise<{ data: unknown[] }> {
            if (this.attempt.listError) throw this.attempt.listError;
            return { data: this.attempt.data ?? [] };
        }
    }

    return { attempts, clients, MockClient };
});

vi.mock('@/codex/codexAppServerClient', () => ({ CodexAppServerClient: mocks.MockClient }));

import { _resetCodexModelsForTests, listCodexModels } from './codexModels';

const sqliteError = new Error('Codex app-server exited (code=1, signal=null)');
const sqliteStderr = 'Error: failed to initialize sqlite state runtime at /Users/private/.codex?token=secret';

describe('listCodexModels', () => {
    beforeEach(() => {
        mocks.attempts.length = 0;
        mocks.clients.length = 0;
        vi.restoreAllMocks();
        _resetCodexModelsForTests({ retryBaseDelayMs: 0, retryRandom: () => 0.5 });
    });

    it('caches successful results and separates includeHidden', async () => {
        mocks.attempts.push({ data: [{ id: 'visible' }] }, { data: [{ id: 'hidden' }] });
        expect(await listCodexModels(false)).toEqual([expect.objectContaining({ id: 'visible' })]);
        expect(await listCodexModels(false)).toEqual([expect.objectContaining({ id: 'visible' })]);
        expect(await listCodexModels(true)).toEqual([expect.objectContaining({ id: 'hidden' })]);
        expect(mocks.clients).toHaveLength(2);
    });

    it('deduplicates concurrent requests', async () => {
        let release: (() => void) | undefined;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        mocks.attempts.push({ initializeGate: gate, data: [{ id: 'shared' }] });
        const first = listCodexModels();
        const second = listCodexModels();
        release?.();
        expect(await Promise.all([first, second])).toEqual([
            [expect.objectContaining({ id: 'shared' })],
            [expect.objectContaining({ id: 'shared' })]
        ]);
        expect(mocks.clients).toHaveLength(1);
    });

    it('retries a SQLite initialization failure and then succeeds', async () => {
        mocks.attempts.push(
            { initializeError: sqliteError, initializeStderr: sqliteStderr },
            { data: [{ id: 'recovered' }] }
        );
        expect(await listCodexModels()).toEqual([expect.objectContaining({ id: 'recovered' })]);
        expect(mocks.clients).toHaveLength(2);
        expect(mocks.clients.every((client) => client.disconnect.mock.calls.length === 1)).toBe(true);
    });

    it('returns only a safe reason after all SQLite initialization attempts fail', async () => {
        mocks.attempts.push(...Array.from({ length: 3 }, () => ({
            initializeError: sqliteError,
            initializeStderr: sqliteStderr
        })));
        const rejection = await listCodexModels().catch((error: unknown) => error);
        expect(rejection).toBeInstanceOf(Error);
        expect((rejection as Error).message).toBe('Codex state database was temporarily unavailable');
        expect((rejection as Error).message).not.toMatch(/Users|token|secret|https?:/u);
        expect(mocks.clients).toHaveLength(3);
    });

    it('does not retry a non-SQLite code=1 failure', async () => {
        mocks.attempts.push({ initializeError: sqliteError, initializeStderr: 'unrelated startup failure' });
        await expect(listCodexModels()).rejects.toThrow('Codex app-server exited (code=1');
        expect(mocks.clients).toHaveLength(1);
    });

    it('clears a rejected in-flight request so the next request can succeed', async () => {
        mocks.attempts.push(
            { listError: new Error('Invalid model/list response') },
            { data: [{ id: 'next-request' }] }
        );
        await expect(listCodexModels()).rejects.toThrow('Invalid model/list response');
        expect(await listCodexModels()).toEqual([expect.objectContaining({ id: 'next-request' })]);
        expect(mocks.clients).toHaveLength(2);
    });

    it('times out an attempt, disconnects it, and does not cache its eventual result', async () => {
        let release: (() => void) | undefined;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        _resetCodexModelsForTests({ attemptTimeoutMs: 10, retryBaseDelayMs: 0 });
        mocks.attempts.push(
            { initializeGate: gate, data: [{ id: 'late' }] },
            { data: [{ id: 'fresh' }] }
        );

        await expect(listCodexModels()).rejects.toThrow('Timed out while listing Codex models');
        expect(mocks.clients[0]?.disconnect).toHaveBeenCalled();
        release?.();
        await Promise.resolve();
        expect(await listCodexModels()).toEqual([expect.objectContaining({ id: 'fresh' })]);
        expect(mocks.clients).toHaveLength(2);
    });
});
