import type {
  PublicModerationStore,
  PublicModerationClaim,
  PublicModerationEvaluation,
  PublicModerationBinding,
  WorkSignals,
} from '../database/index.ts';
import { WorkScheduler } from '../work-scheduler/index.ts';

/** A configured runner must be validated separately; this contract does not select a model. */
export interface PublicModerationRunner {
  model: { hash: string; runtime: string };
  evaluate(
    job: PublicModerationClaim,
    signal: AbortSignal,
  ): Promise<PublicModerationEvaluation>;
}
type ModerationQueue = Pick<
  PublicModerationStore,
  'claim' | 'finish' | 'fail' | 'recover'
> &
  Partial<Pick<PublicModerationStore, 'nextWork'>>;
/** One owned inference at a time, with bounded attempts and durable lease recovery. */
export class PublicModerationWorker {
  private readonly queue: ModerationQueue;
  private readonly bind: PublicModerationBinding;
  private readonly runner: PublicModerationRunner | null;
  private readonly upgradePolicy: (() => Promise<number>) | null;
  private readonly stop = new AbortController();
  private running: Promise<void> | null = null;
  private readonly scheduler: WorkScheduler;
  private readonly unsubscribe: (() => void) | undefined;
  constructor(options: {
    queue: ModerationQueue;
    bind: PublicModerationBinding;
    runner: PublicModerationRunner | null;
    upgradePolicy?: () => Promise<number>;
    signals?: Pick<WorkSignals, 'subscribe'>;
    keepAlive?: boolean;
  }) {
    this.queue = options.queue;
    this.bind = options.bind;
    this.runner = options.runner;
    this.upgradePolicy = options.upgradePolicy ?? null;
    this.scheduler = new WorkScheduler({
      keepAlive: options.keepAlive ?? false,
      work: async () => {
        await this.run();
        return this.queue.nextWork?.(this.runner !== null) ?? null;
      },
      failed: () => {
        process.stderr.write('Análise pública indisponível.\n');
      },
    });
    this.unsubscribe = options.signals?.subscribe('public-moderation', () =>
      this.scheduler.wake(),
    );
  }
  async initialize(): Promise<void> {
    while (!this.stop.signal.aborted && (await this.queue.recover()) === 32)
      await new Promise<void>((accept) => setImmediate(accept));
    if (!this.upgradePolicy || this.stop.signal.aborted) return;
    try {
      while (!this.stop.signal.aborted && (await this.upgradePolicy()) === 32)
        await new Promise<void>((accept) => setImmediate(accept));
    } catch {
      process.stderr.write('Reanálise após mudança da regra está pendente.\n');
    }
  }
  start(): void {
    if (this.stop.signal.aborted)
      throw new Error('Analisador público encerrado.');
    if (!this.runner && !this.upgradePolicy) return;
    this.scheduler.start();
  }
  async close(): Promise<void> {
    this.unsubscribe?.();
    this.stop.abort();
    await this.scheduler.close();
    if (this.running) await this.running;
  }
  async run(): Promise<void> {
    if (this.stop.signal.aborted) return;
    if (this.running) return this.running;
    this.running = this.runner ? this.drain(this.runner) : this.initialize();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }
  private async drain(runner: PublicModerationRunner): Promise<void> {
    await this.initialize();
    while (!this.stop.signal.aborted) {
      const job = await this.queue.claim(runner.model);
      if (!job) return;
      try {
        // The deadline precedes the ten-minute lease; the runner must abort its processes.
        const signal = AbortSignal.any([
          this.stop.signal,
          AbortSignal.timeout(360_000),
        ]);
        const result = await runner.evaluate(job, signal);
        if (signal.aborted) throw signal.reason;
        await this.queue.finish(job, result, this.bind);
      } catch {
        // A stale/replaced lease cannot be revived by fail(); outages keep its durable lease.
        await this.queue.fail(job);
      }
      await new Promise<void>((accept) => setImmediate(accept));
    }
  }
}
