import os from 'node:os';
import { AccountError } from '../../shared/account/index.ts';
import { reserveOperationMemory } from '../memory-admission/index.ts';

interface Job {
  key: string;
  signal: AbortSignal;
  work: () => Promise<string>;
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
  release: () => void;
  abort: () => void;
}

/** Owned FIFO work, with independent media scopes sharing available worker slots. */
export class MediaExecutionQueue {
  private readonly pending = new Set<Job>();
  private readonly active = new Set<string>();
  private readonly capacity = Math.max(
    1,
    Math.min(
      Math.floor(os.availableParallelism() / 4),
      Math.floor(
        Math.min(os.totalmem(), process.constrainedMemory() || Infinity) /
          8_589_934_592,
      ),
    ),
  );

  run(input: {
    key: string;
    signal: AbortSignal;
    work: () => Promise<string>;
  }): Promise<string> {
    input.signal.throwIfAborted();
    // Bound command/callback state while waiting. Payloads stay in owned files.
    const release = reserveOperationMemory(65_536);
    if (!release)
      return Promise.reject(
        new AccountError(
          503,
          'Processador indisponível ou interrompido. Retome o envio.',
        ),
      );
    return new Promise<string>((resolve, reject) => {
      const job: Job = {
        ...input,
        resolve,
        reject,
        release,
        abort: () => this.cancel(job),
      };
      input.signal.addEventListener('abort', job.abort, { once: true });
      this.pending.add(job);
      this.drain();
    });
  }

  private cancel(job: Job): void {
    if (!this.pending.delete(job)) return;
    job.signal.removeEventListener('abort', job.abort);
    job.release();
    job.reject(job.signal.reason);
    this.drain();
  }

  private drain(): void {
    while (this.active.size < this.capacity) {
      const job = this.nextReady();
      if (!job) return;
      this.pending.delete(job);
      job.signal.removeEventListener('abort', job.abort);
      this.active.add(job.key);
      void this.execute(job);
    }
  }

  private nextReady(): Job | undefined {
    for (const job of this.pending) if (!this.active.has(job.key)) return job;
    return undefined;
  }

  private async execute(job: Job): Promise<void> {
    try {
      job.signal.throwIfAborted();
      job.resolve(await job.work());
    } catch (error: unknown) {
      job.reject(error);
    } finally {
      this.active.delete(job.key);
      job.release();
      this.drain();
    }
  }
}
