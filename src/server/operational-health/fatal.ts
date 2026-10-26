import {
  constants,
  closeSync,
  fsyncSync,
  fchmodSync,
  openSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { diagnosticFile } from './storage.ts';

/** Monitor only: Node's default fatal-exit behavior is preserved. No error text. */
export function observeFatal(directory: string): () => void {
  const listener = (
    _error: Error,
    origin: 'uncaughtException' | 'unhandledRejection',
  ) => {
    let file: number | undefined;
    const target = diagnosticFile(directory, 'fatal');
    const pending = target + '.pending';
    try {
      file = openSync(
        pending,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_TRUNC |
          constants.O_NOFOLLOW,
        0o600,
      );
      fchmodSync(file, 0o600);
      const memory = process.memoryUsage();
      writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          reason:
            origin === 'unhandledRejection'
              ? 'unhandled-rejection'
              : 'uncaught-exception',
          recordedAt: new Date().toISOString(),
          uptimeSeconds: process.uptime(),
          rssBytes: memory.rss,
          heapUsedBytes: memory.heapUsed,
        }),
      );
      fsyncSync(file);
      closeSync(file);
      file = undefined;
      renameSync(pending, target);
    } catch {
      // Disk exhaustion or fatal runtime state can prevent this best-effort record.
    } finally {
      if (file !== undefined) closeSync(file);
    }
  };
  process.on('uncaughtExceptionMonitor', listener);
  return () => process.removeListener('uncaughtExceptionMonitor', listener);
}
