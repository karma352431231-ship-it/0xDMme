export type HistoryKind = 'direct' | 'groups';
export interface PreparationTurn {
  kind: HistoryKind;
  version: number;
}

/** Completed histories stay idle until an actual wakeup requests a snapshot check.
 * An event arriving during a page cannot be swallowed by that page's completion. */
export class HistoryPreparation {
  private version = 0;
  private readonly remaining = new Set<HistoryKind>(['direct', 'groups']);
  private preferred: HistoryKind = 'direct';

  get pending(): boolean {
    return this.remaining.size > 0;
  }
  request(): void {
    this.version++;
    this.remaining.add('direct');
    this.remaining.add('groups');
  }
  next(): PreparationTurn | null {
    const kind = this.remaining.has(this.preferred)
      ? this.preferred
      : this.remaining.values().next().value;
    return kind ? { kind, version: this.version } : null;
  }
  complete(turn: PreparationTurn, more: boolean): void {
    if (turn.version !== this.version) return;
    if (!more) this.remaining.delete(turn.kind);
    this.preferred = turn.kind === 'direct' ? 'groups' : 'direct';
  }
}
