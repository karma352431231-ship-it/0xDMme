import type { WorkTopic, WorkSignals } from '../database/index.ts';
/** One bounded scheduler per consumer; notices received during work are retained. */
export class WorkScheduler {
  private readonly work: () => Promise<number | null>;
  private readonly failed: () => void;
  private readonly fallbackMs: number;
  private readonly coalesceMs: number;
  private readonly keepAlive: boolean;
  private nextAt: number | null = null;
  private due: ReturnType<typeof setTimeout> | null = null;
  private fallback: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private requested = false;
  private stopped = false;
  private started = false;
  constructor(options: {
    work: () => Promise<number | null>;
    failed: () => void;
    fallbackMs?: number;
    coalesceMs?: number;
    keepAlive?: boolean;
  }) {
    this.work = options.work;
    this.failed = options.failed;
    this.fallbackMs = options.fallbackMs ?? 300_000;
    this.coalesceMs = options.coalesceMs ?? 0;
    this.keepAlive = options.keepAlive ?? false;
  }
  start(): void {
    if (this.stopped) throw new Error('Consumidor encerrado.');
    if (this.started) return;
    this.started = true;
    if (this.fallbackMs > 0) {
      this.fallback = setInterval(() => this.wake(), this.fallbackMs);
      if (!this.keepAlive) this.fallback.unref();
    }
    this.wake();
  }
  wake(): void {
    if (this.stopped) return;
    if (this.running) {
      this.requested = true;
      return;
    }
    if (this.coalesceMs > 0) {
      this.schedule(
        Math.min(this.nextAt ?? Infinity, Date.now() + this.coalesceMs),
      );
      return;
    }
    this.run();
  }
  private run(): void {
    void this.flush().catch(() => {
      this.failed();
      this.schedule(Date.now() + 5000);
    });
  }
  async flush(): Promise<void> {
    if (this.stopped) return;
    this.requested = true;
    if (this.due) clearTimeout(this.due);
    this.due = null;
    this.nextAt = null;
    if (this.running) return this.running;
    // Assign ownership before user work can synchronously emit another notice.
    this.running = Promise.resolve().then(() => this.drain());
    try {
      await this.running;
    } catch (error: unknown) {
      this.requested = false;
      throw error;
    } finally {
      this.running = null;
      if (this.requested && !this.stopped) this.wake();
    }
  }
  private async drain(): Promise<void> {
    while (this.requested && !this.stopped) {
      this.requested = false;
      const next = await this.work();
      if (next !== null && next <= Date.now()) this.requested = true;
      else if (next !== null) this.schedule(next);
      if (this.requested)
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  private schedule(at: number): void {
    if (this.stopped) return;
    if (this.due) clearTimeout(this.due);
    this.nextAt = at;
    this.due = setTimeout(
      () => {
        this.due = null;
        this.nextAt = null;
        this.run();
      },
      Math.min(2_147_483_647, Math.max(1, at - Date.now())),
    );
    if (!this.keepAlive) this.due.unref();
  }
  async close(): Promise<void> {
    this.stopped = true;
    if (this.due) clearTimeout(this.due);
    if (this.fallback) clearInterval(this.fallback);
    await this.running;
  }
}

export interface WorkConsumer {
  topic: WorkTopic;
  work: () => Promise<void>;
  next: () => Promise<number | null>;
}
/** Composition only; domain operations and their deadlines stay with their owners. */
export class WorkConsumers {
  private readonly workers: WorkScheduler[];
  private readonly subscriptions: (() => void)[];
  constructor(
    tasks: WorkConsumer[],
    signals: Pick<WorkSignals, 'subscribe'>,
    options: { fallbackMs?: number; keepAlive?: boolean } = {},
  ) {
    this.workers = tasks.map(
      (task) =>
        new WorkScheduler({
          ...options,
          coalesceMs: 25,
          work: async () => {
            await task.work();
            return task.next();
          },
          failed: () => {
            process.stderr.write(`Manutenção ${task.topic} pendente.\n`);
          },
        }),
    );
    this.subscriptions = tasks.map((task, index) =>
      signals.subscribe(task.topic, () => this.workers[index]?.wake()),
    );
  }
  start(): void {
    for (const worker of this.workers) worker.start();
  }
  async close(): Promise<void> {
    for (const unsubscribe of this.subscriptions) unsubscribe();
    const results = await Promise.allSettled(
      this.workers.map((worker) => worker.close()),
    );
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('Consumidor não encerrou.');
  }
}
