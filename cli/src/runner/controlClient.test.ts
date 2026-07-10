import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function waitForSpawn(child: ChildProcess): Promise<number> {
  if (child.pid) {
    return child.pid;
  }

  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });

  if (!child.pid) {
    throw new Error('Child process started without a PID');
  }

  return child.pid;
}

async function runHealthCheck(pid: number, testHome: string): Promise<boolean> {
  const script = `
    import { writeRunnerState } from './src/persistence.ts';
    import { checkIfRunnerRunningAndCleanupStaleState } from './src/runner/controlClient.ts';

    writeRunnerState({
      pid: ${pid},
      httpPort: 1,
      startTime: new Date().toISOString(),
      startedWithCliVersion: 'test-version',
      startedWithMachineId: 'test-machine'
    });
    const running = await checkIfRunnerRunningAndCleanupStaleState();
    console.log(JSON.stringify({ running }));
  `;
  const verifier = spawn(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HAPI_HOME: testHome
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  verifier.stdout?.on('data', chunk => {
    stdout += chunk.toString();
  });
  verifier.stderr?.on('data', chunk => {
    stderr += chunk.toString();
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    verifier.once('error', reject);
    verifier.once('exit', resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`Health check subprocess failed: ${stderr}`);
  }

  return (JSON.parse(stdout.trim()) as { running: boolean }).running;
}

describe('checkIfRunnerRunningAndCleanupStaleState', () => {
  let child: ChildProcess | undefined;
  let testHome: string | undefined;

  afterEach(async () => {
    if (child?.pid) {
      const exited = new Promise<void>((resolve) => child!.once('exit', () => resolve()));
      child.kill('SIGKILL');
      await exited;
    }
    child = undefined;

    if (testHome) {
      rmSync(testHome, { recursive: true, force: true });
    }
    testHome = undefined;
  });

  it('cleans stale state when PID belongs to a non-runner process', async () => {
    child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore'
    });
    const pid = await waitForSpawn(child);
    testHome = mkdtempSync(join(tmpdir(), 'hapi-runner-control-'));

    await expect(runHealthCheck(pid, testHome)).resolves.toBe(false);
    expect(existsSync(join(testHome, 'runner.state.json'))).toBe(false);
  });
});
