import { describe, expect, it } from 'vitest';
import {
    CodexAppServerStderrTail,
    formatCodexAppServerExitError
} from './codexAppServerClient';

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
