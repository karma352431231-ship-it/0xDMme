/** Publishes one complete synchronized view. No intermediate history reaches the UI. */
export class MessageVisibility<T> {
  private generation = 0;
  private staged: T[] = [];
  private token: number | null = null;
  private readonly publish: (rows: readonly T[] | null) => void;
  constructor(publish: (rows: readonly T[] | null) => void) {
    this.publish = publish;
  }
  close(): void {
    this.generation++;
    this.token = null;
    this.staged = [];
    this.publish(null);
  }
  begin(): number {
    this.close();
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
    this.publish(rows);
  }
  fail(token: number): void {
    if (token === this.token) this.close();
  }
  private assert(token: number): void {
    if (this.token !== token || token !== this.generation)
      throw new Error('Sincronização de mensagens substituída.');
  }
}
