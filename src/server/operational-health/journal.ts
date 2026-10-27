import { diagnosticRecord } from './record.ts';
import {
  diagnosticFile,
  prepareDirectory,
  readPrivate,
  writePrivate,
} from './storage.ts';

/** Fixed aggregate incident ring survives a process restart; no request history. */
export class DiagnosticJournal {
  private events: Record<string, unknown>[] = [];
  private readonly directory: string;
  constructor(directory: string) {
    this.directory = directory;
  }
  async initialize(): Promise<boolean> {
    await prepareDirectory(this.directory);
    const previous = await readPrivate(
      diagnosticFile(this.directory, 'events'),
    );
    if (previous) {
      if (
        previous['version'] !== 1 ||
        !Array.isArray(previous['events']) ||
        previous['events'].length > 32
      )
        throw new Error('Invalid incident history.');
      this.events = previous['events'].map((value: unknown) =>
        diagnosticRecord(value),
      );
    }
    const lifecycle = await readPrivate(
      diagnosticFile(this.directory, 'lifecycle'),
    );
    const interrupted = lifecycle?.['state'] === 'running';
    await this.lifecycle('running');
    return interrupted;
  }
  async append(event: Record<string, unknown>): Promise<void> {
    const next = [...this.events.slice(-31), diagnosticRecord(event)];
    await writePrivate(diagnosticFile(this.directory, 'events'), {
      version: 1,
      events: next,
    });
    this.events = next;
  }
  lifecycle(state: 'running' | 'stopped'): Promise<void> {
    return writePrivate(diagnosticFile(this.directory, 'lifecycle'), {
      version: 1,
      state,
      recordedAt: new Date().toISOString(),
    });
  }
}
