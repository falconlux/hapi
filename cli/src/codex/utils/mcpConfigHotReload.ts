import { watch, type FSWatcher } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { logger } from '@/ui/logger';

const DEFAULT_DEBOUNCE_MS = 250;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_MAX_ATTEMPTS = 3;

export function resolveCodexConfigPath(
    env: NodeJS.ProcessEnv = process.env,
    homeDirectory: string = homedir()
): string {
    const configuredHome = env.CODEX_HOME?.trim();
    return join(configuredHome || join(homeDirectory, '.codex'), 'config.toml');
}

export type McpConfigHotReloaderOptions = {
    configPath?: string;
    debounceMs?: number;
    retryDelayMs?: number;
    maxAttempts?: number;
    reload: () => Promise<void>;
};

/**
 * Watches the directory instead of config.toml itself so editor-style atomic
 * replacement (write temp file + rename) keeps working after the first save.
 */
export class McpConfigHotReloader {
    private readonly configPath: string;
    private readonly configFileName: string;
    private readonly debounceMs: number;
    private readonly retryDelayMs: number;
    private readonly maxAttempts: number;
    private readonly reload: () => Promise<void>;
    private watcher: FSWatcher | null = null;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private retryResolve: (() => void) | null = null;
    private reloadInFlight = false;
    private reloadQueued = false;
    private stopped = true;

    constructor(options: McpConfigHotReloaderOptions) {
        this.configPath = options.configPath ?? resolveCodexConfigPath();
        this.configFileName = basename(this.configPath);
        this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
        this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
        this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
        this.reload = options.reload;
    }

    start(): void {
        this.stop();
        this.stopped = false;

        try {
            this.watcher = watch(dirname(this.configPath), { persistent: false }, (_eventType, fileName) => {
                if (fileName && fileName.toString() !== this.configFileName) {
                    return;
                }
                this.scheduleReload();
            });
            this.watcher.on('error', (error) => {
                logger.debug(`[Codex] MCP config watcher error for ${this.configPath}`, error);
            });
            logger.debug(`[Codex] Watching MCP config for hot reload: ${this.configPath}`);
        } catch (error) {
            logger.debug(`[Codex] Unable to watch MCP config ${this.configPath}`, error);
        }
    }

    stop(): void {
        this.stopped = true;
        this.reloadQueued = false;
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        this.retryResolve?.();
        this.retryResolve = null;
        this.watcher?.close();
        this.watcher = null;
    }

    /** Exposed for deterministic tests and explicit refresh triggers. */
    notifyConfigChanged(): void {
        this.scheduleReload();
    }

    private scheduleReload(): void {
        if (this.stopped) return;
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            void this.runReload();
        }, this.debounceMs);
        this.debounceTimer.unref();
    }

    private async runReload(): Promise<void> {
        if (this.stopped) return;
        if (this.reloadInFlight) {
            this.reloadQueued = true;
            return;
        }

        this.reloadInFlight = true;
        try {
            for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
                if (this.stopped) return;
                try {
                    await this.reload();
                    logger.debug(`[Codex] MCP configuration hot-reloaded from ${this.configPath}`);
                    return;
                } catch (error) {
                    if (attempt >= this.maxAttempts) {
                        logger.debug(
                            `[Codex] MCP configuration reload failed after ${attempt} attempt(s)`,
                            error
                        );
                        return;
                    }
                    await this.waitForRetry();
                }
            }
        } finally {
            this.reloadInFlight = false;
            if (this.reloadQueued && !this.stopped) {
                this.reloadQueued = false;
                this.scheduleReload();
            }
        }
    }

    private waitForRetry(): Promise<void> {
        return new Promise((resolve) => {
            this.retryResolve = resolve;
            this.retryTimer = setTimeout(() => {
                this.retryTimer = null;
                this.retryResolve = null;
                resolve();
            }, this.retryDelayMs);
            this.retryTimer.unref();
        });
    }
}
