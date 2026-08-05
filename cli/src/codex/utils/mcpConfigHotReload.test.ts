import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpConfigHotReloader, resolveCodexConfigPath } from './mcpConfigHotReload';

const cleanupPaths: string[] = [];

afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('MCP config hot reload', () => {
    it('resolves config.toml from the active CODEX_HOME', () => {
        expect(resolveCodexConfigPath({ CODEX_HOME: '/tmp/codex-active' }, '/home/test')).toBe(
            '/tmp/codex-active/config.toml'
        );
        expect(resolveCodexConfigPath({}, '/home/test')).toBe('/home/test/.codex/config.toml');
    });

    it('debounces repeated changes into one reload', async () => {
        vi.useFakeTimers();
        const root = await mkdtemp(join(tmpdir(), 'hapi-mcp-reload-'));
        cleanupPaths.push(root);
        const reload = vi.fn(async () => {});
        const reloader = new McpConfigHotReloader({
            configPath: join(root, 'config.toml'),
            debounceMs: 50,
            reload
        });

        reloader.start();
        reloader.notifyConfigChanged();
        reloader.notifyConfigChanged();
        reloader.notifyConfigChanged();
        await vi.advanceTimersByTimeAsync(49);
        expect(reload).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(reload).toHaveBeenCalledTimes(1);
        reloader.stop();
    });

    it('retries a transient reload failure', async () => {
        vi.useFakeTimers();
        const root = await mkdtemp(join(tmpdir(), 'hapi-mcp-retry-'));
        cleanupPaths.push(root);
        const reload = vi.fn()
            .mockRejectedValueOnce(new Error('config is still being replaced'))
            .mockResolvedValue(undefined);
        const reloader = new McpConfigHotReloader({
            configPath: join(root, 'config.toml'),
            debounceMs: 10,
            retryDelayMs: 20,
            reload
        });

        reloader.start();
        reloader.notifyConfigChanged();
        await vi.advanceTimersByTimeAsync(30);
        expect(reload).toHaveBeenCalledTimes(2);
        reloader.stop();
    });

    it('detects atomic config replacement through the directory watcher', async () => {
        const root = await mkdtemp(join(tmpdir(), 'hapi-mcp-atomic-'));
        cleanupPaths.push(root);
        const configPath = join(root, 'config.toml');
        const replacementPath = join(root, 'config.toml.next');
        await writeFile(configPath, 'model = "first"\n');
        const reload = vi.fn(async () => {});
        const reloader = new McpConfigHotReloader({
            configPath,
            debounceMs: 20,
            reload
        });

        reloader.start();
        await writeFile(replacementPath, 'model = "second"\n');
        await rename(replacementPath, configPath);

        const deadline = Date.now() + 2_000;
        while (reload.mock.calls.length === 0 && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(reload).toHaveBeenCalledTimes(1);
        reloader.stop();
    });

    it('does not reload after being stopped', async () => {
        vi.useFakeTimers();
        const root = await mkdtemp(join(tmpdir(), 'hapi-mcp-stop-'));
        cleanupPaths.push(root);
        const reload = vi.fn(async () => {});
        const reloader = new McpConfigHotReloader({
            configPath: join(root, 'config.toml'),
            debounceMs: 10,
            reload
        });

        reloader.start();
        reloader.notifyConfigChanged();
        reloader.stop();
        await vi.advanceTimersByTimeAsync(20);
        expect(reload).not.toHaveBeenCalled();
    });

    it('cancels a pending retry when stopped', async () => {
        vi.useFakeTimers();
        const root = await mkdtemp(join(tmpdir(), 'hapi-mcp-cancel-retry-'));
        cleanupPaths.push(root);
        const reload = vi.fn(async () => {
            throw new Error('reload failed');
        });
        const reloader = new McpConfigHotReloader({
            configPath: join(root, 'config.toml'),
            debounceMs: 10,
            retryDelayMs: 10_000,
            reload
        });

        reloader.start();
        reloader.notifyConfigChanged();
        await vi.advanceTimersByTimeAsync(10);
        expect(reload).toHaveBeenCalledTimes(1);
        reloader.stop();
        await vi.runAllTimersAsync();
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
