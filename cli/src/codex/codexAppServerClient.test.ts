import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execFileSyncMock, spawnMock } = vi.hoisted(() => ({
    execFileSyncMock: vi.fn(() => 'codex-cli 1.0.0'),
    spawnMock: vi.fn()
}));

vi.mock('node:child_process', async () => {
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
    return {
        ...actual,
        execFileSync: execFileSyncMock,
        spawn: spawnMock
    };
});

vi.mock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    return { ...actual, existsSync: vi.fn(() => false) };
});

vi.mock('@/utils/process', () => ({
    killProcessByChildProcess: vi.fn(async () => true)
}));

vi.mock('@/ui/logger', () => ({
    logger: { debug: vi.fn() }
}));

import {
    CodexAppServerClient,
    CodexAppServerStderrTail,
    formatCodexAppServerExitError
} from './codexAppServerClient';

function fakeStream(): EventEmitter & { setEncoding: ReturnType<typeof vi.fn> } {
    return Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
}

function fakeChild() {
    return Object.assign(new EventEmitter(), {
        stdin: { end: vi.fn(), write: vi.fn() },
        stdout: fakeStream(),
        stderr: fakeStream()
    });
}

describe('CodexAppServerClient process cwd', () => {
    beforeEach(() => {
        execFileSyncMock.mockClear();
        spawnMock.mockReset();
    });

    it('passes an explicit neutral cwd to the app-server process', async () => {
        spawnMock.mockReturnValue(fakeChild());
        const client = new CodexAppServerClient({ cwd: '/neutral-home' });

        await client.connect();

        expect(spawnMock).toHaveBeenCalledWith(
            'codex',
            ['app-server'],
            expect.objectContaining({ cwd: '/neutral-home' })
        );
        await client.disconnect();
    });
});

describe('Codex app-server exit errors', () => {
    it('preserves the existing exit text when stderr is empty', () => {
        expect(formatCodexAppServerExitError(126, null, '   \n')).toBe(
            'Codex app-server exited (code=126, signal=null)'
        );
    });

    it('does not turn stderr from a successful exit into an error detail', () => {
        expect(formatCodexAppServerExitError(0, null, 'shutdown warning')).toBe(
            'Codex app-server exited (code=0, signal=null)'
        );
    });

    it('appends trimmed stderr to a nonzero exit error', () => {
        const stderr = new CodexAppServerStderrTail();
        stderr.append('native binary is missing\n');
        stderr.append('cannot execute:   No such file or directory\n');

        expect(formatCodexAppServerExitError(126, null, stderr.detail())).toBe(
            'Codex app-server exited (code=126, signal=null): native binary is missing\ncannot execute:   No such file or directory'
        );
    });

    it('bounds retained stderr and clears it between processes', () => {
        const stderr = new CodexAppServerStderrTail();
        stderr.append(`stale reason\n${'x'.repeat(5_000)}`);

        expect(stderr.detail()).toHaveLength(4_096);
        expect(stderr.detail()).not.toContain('stale reason');

        stderr.reset();
        expect(stderr.detail()).toBe('');

        stderr.append('new reason');
        expect(stderr.detail()).toBe('new reason');
    });
});
