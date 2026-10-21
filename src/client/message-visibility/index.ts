/** Publishes one complete synchronized view. No intermediate history reaches the UI. */
export type HistoryUpdate = 'history' | 'delivery' | 'pending';
export class MessageVisibility<T> {
  private generation = 0;
  private staged: T[] = [];
  private token: number | null = null;
  private update: HistoryUpdate = 'history';
  private changeVersion = 0;
  private startedVersion = 0;
  private visible = false;
  private retained = false;
  private readonly publish: (
    rows: readonly T[] | null,
    update: HistoryUpdate,
  ) => void;
  constructor(
    publish: (rows: readonly T[] | null, update: HistoryUpdate) => void,
  ) {
    this.publish = publish;
  }
  close(update: HistoryUpdate = 'history'): void {
    this.generation++;
    this.token = null;
    this.staged = [];
    this.update = update;
    this.retained = update === 'pending';
    this.visible = false;
    this.publish(null, update);
  }
  begin(update: HistoryUpdate = 'history'): number {
    this.close(update);
    return this.start();
  }
  /** Retain only the last complete view while preparing a normal update. */
  refresh(update: HistoryUpdate = 'history'): number {
    // Reopening needs a history projection, including when a removal hint kept
    // the previous DOM hidden pending a verified incremental response.
    if (!this.visible) {
      this.close(this.retained ? 'pending' : 'history');
      this.update = 'history';
      return this.start();
    }
    this.generation++;
    this.staged = [];
    this.update = update;
    return this.start();
  }
  private start(): number {
    this.token = this.generation;
    this.startedVersion = this.changeVersion;
    return this.generation;
  }
  /** Normal wakeups require a fresh confirmation without hiding verified rows.
   * Removal and authority changes use close(), cancelling the current token. */
  hint(): void {
    this.changeVersion++;
  }
  /** A newly authenticated destructive/authority fence conceals the old view
   * immediately, while the current reader may continue validating the new cut. */
  conceal(token: number): void {
    this.assert(token);
    this.staged = [];
    this.visible = false;
    this.retained = false;
    this.publish(null, 'history');
  }
  /** A probe found new content; drop its staged work before the full read. */
  discard(token: number): void {
    this.assert(token);
    this.generation++;
    this.token = null;
    this.staged = [];
  }
  verificationVersion(token: number): number {
    this.assert(token);
    return this.changeVersion;
  }
  stage(token: number, rows: readonly T[]): void {
    this.assert(token);
    this.staged.push(...rows);
  }
  complete(token: number, version?: number): boolean {
    this.assert(token);
    if ((version ?? this.startedVersion) !== this.changeVersion) {
      if (version === undefined)
        throw new Error('Message verification superseded by a new notice.');
      return false;
    }
    const rows = this.staged;
    this.staged = [];
    this.token = null;
    this.visible = true;
    this.retained = false;
    this.publish(rows, this.update);
    return true;
  }
  /** The caller checks the same authenticated snapshot. Hints received during
   * that check require a new check; failure/authority cancellation stays closed. */
  async confirm(token: number, check: () => Promise<void>): Promise<void> {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const version = this.verificationVersion(token);
        await check();
        if (this.complete(token, version)) return;
      }
      throw new Error('New updates arrived during verification. Sync again.');
    } catch (error: unknown) {
      this.fail(token);
      throw error;
    }
  }
  /** V2 checks a finite cut and its security fence. Ordinary append hints
   * queue the next cut; close() still invalidates this token immediately. */
  async confirmCut(token: number, check: () => Promise<void>): Promise<void> {
    try {
      await check();
      this.complete(token, this.verificationVersion(token));
    } catch (error: unknown) {
      this.fail(token);
      throw error;
    }
  }
  fail(token: number): void {
    if (token === this.token) this.close();
  }
  private assert(token: number): void {
    if (this.token !== token || token !== this.generation)
      throw new Error('Message synchronization superseded.');
  }
}
