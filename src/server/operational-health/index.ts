import type { Server } from 'node:http';
import type { Database } from '../database/index.ts';
import type { DiagnosticEvent, DiagnosticReason } from './model.ts';
import { TrafficDiagnostics } from './traffic.ts';
import { sampleResources } from './resources.ts';
import { DiagnosticJournal } from './journal.ts';
import { diagnosticDirectory } from './storage.ts';
import { observeFatal } from './fatal.ts';
export { diagnosticDirectory } from './storage.ts';
export { readDiagnostics } from './read.ts';
export { TrafficDiagnostics } from './traffic.ts';
export { DiagnosticJournal } from './journal.ts';
export type { DiagnosticEvent } from './model.ts';

/** Event-driven evidence; one collection at a time and no periodic SQL/file writes. */
export class OperationalHealth {
  private readonly traffic = new TrafficDiagnostics((event) =>
    this.note(event),
  );
  private readonly journal: DiagnosticJournal;
  private readonly detach: () => void;
  private readonly last = new Map<DiagnosticReason, number>();
  private pending: Promise<void> = Promise.resolve();
  private readonly queued = new Map<DiagnosticReason, DiagnosticEvent>();
  private running = false;
  private closed = false;
  private ready = false;
  private initialization: Promise<void> | undefined;
  private stopFatal: (() => void) | undefined;
  private readonly input: {
    server: Server;
    database: Pick<Database, 'operationalSnapshot'>;
    directory: string;
  };
  constructor(input: OperationalHealth['input']) {
    this.input = input;
    this.journal = new DiagnosticJournal(diagnosticDirectory(input.directory));
    this.detach = this.traffic.attach(input.server);
  }
  start(): Promise<void> {
    this.initialization ??= this.initialize();
    return this.initialization;
  }
  private async initialize(): Promise<void> {
    try {
      const interrupted = await this.journal.initialize();
      this.ready = true;
      this.stopFatal = observeFatal(diagnosticDirectory(this.input.directory));
      this.note({ reason: interrupted ? 'unexpected-restart' : 'startup' });
    } catch {
      this.failed();
    }
  }
  note(event: DiagnosticEvent): void {
    if (this.closed) return;
    const now = performance.now();
    if (now - (this.last.get(event.reason) ?? -Infinity) < 60000) return;
    this.last.set(event.reason, now);
    this.queued.set(event.reason, event);
    if (this.running || !this.ready) return;
    this.running = true;
    this.pending = this.drain()
      .catch(() => this.failed())
      .finally(() => {
        this.running = false;
      });
  }
  private async drain(): Promise<void> {
    while (this.queued.size) {
      const events = [...this.queued.values()];
      this.queued.clear();
      await this.collect(events);
    }
  }
  private async collect(events: DiagnosticEvent[]): Promise<void> {
    const observedAt = new Date().toISOString();
    const traffic = this.traffic.snapshot();
    const [resources, database] = await Promise.allSettled([
      sampleResources(this.input.directory),
      this.input.database.operationalSnapshot(),
    ]);
    const metrics = {
      traffic,
      resources: resources.status === 'fulfilled' ? resources.value : null,
      database: database.status === 'fulfilled' ? database.value : null,
    };
    for (const event of events)
      await this.journal.append({
        ...event,
        observedAt,
        collectedAt: new Date().toISOString(),
        metrics,
      });
  }
  private failed(): void {
    process.stderr.write(
      'Incident diagnostics unavailable; evidence may be incomplete.\n',
    );
  }
  async close(): Promise<void> {
    if (this.closed) return;
    await this.initialization;
    this.detach();
    this.note({ reason: 'shutdown' });
    this.closed = true;
    await this.pending;
    this.stopFatal?.();
    await this.journal.lifecycle('stopped').catch(() => this.failed());
  }
}
export function startOperationalHealth(input: {
  server: Server;
  database: Pick<Database, 'operationalSnapshot'>;
  directory: string;
}): OperationalHealth {
  const health = new OperationalHealth(input);
  void health.start();
  return health;
}
