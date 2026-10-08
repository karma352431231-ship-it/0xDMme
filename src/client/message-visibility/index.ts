/** Publishes one complete synchronized view. No intermediate history reaches the UI. */
export type HistoryUpdate = 'history' | 'delivery';
export class MessageVisibility<T> {
  private generation = 0;
  private staged: T[] = [];
  private token: number | null = null;
  private update: HistoryUpdate = 'history';
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
    this.publish(null, update);
  }
  begin(update: HistoryUpdate = 'history'): number {
    this.close(update);
    this.token = this.generation;
    return this.generation;
  }
  stage(token: number, rows: readonly T[]): void {
    this.assert(token);
    this.staged.push(...rows);
  }
  complete(token: number): void {
    this.assert(token);
    const rows = this.staged;
    this.staged = [];
    this.token = null;
    this.publish(rows, this.update);
  }
  fail(token: number): void {
    if (token === this.token) this.close();
  }
  private assert(token: number): void {
    if (this.token !== token || token !== this.generation)
      throw new Error('Sincronização de mensagens substituída.');
  }
}
