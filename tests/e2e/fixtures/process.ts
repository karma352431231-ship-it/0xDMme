import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
export function processExit(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });
}

export function startProcess(
  args: string[],
  environment: NodeJS.ProcessEnv,
): ChildProcess {
  return spawn(process.execPath, args, {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
}
export function signalProcess(
  child: ChildProcess,
  signal: NodeJS.Signals,
): void {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}
export async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = processExit(child);
  signalProcess(child, 'SIGTERM');
  const timer = setTimeout(() => signalProcess(child, 'SIGKILL'), 10_000);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}
export async function command(
  args: string[],
  environment = process.env,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const child = startProcess(args, environment);
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  const abort = () => {
    signalProcess(child, 'SIGTERM');
  };
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => signalProcess(child, 'SIGKILL'), 120_000);
  try {
    const code = await processExit(child);
    if (code !== 0)
      throw new Error(`Test preparation failed (${String(code)}).`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
