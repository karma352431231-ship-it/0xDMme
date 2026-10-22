export type HistoryKind = 'direct' | 'groups';
export interface PreparationTurn {
  kind: HistoryKind;
  version: number;
}

/** Completed histories stay idle until an actual wakeup requests a snapshot check.
 * An event arriving during a page cannot be swallowed by that page's completion. */
export class HistoryPreparation {
  private readonly versions: Record<HistoryKind, number> = {
    direct: 0,
    groups: 0,
  };
  private readonly remaining = new Set<HistoryKind>(['direct', 'groups']);
  private preferred: HistoryKind = 'direct';

  get pending(): boolean {
    return this.remaining.size > 0;
  }
  has(kind: HistoryKind): boolean {
    return this.remaining.has(kind);
  }
  request(kind?: HistoryKind): void {
    if (kind) this.requestKind(kind);
    else {
      this.requestKind('direct');
      this.requestKind('groups');
    }
  }
  private requestKind(kind: HistoryKind): void {
    this.versions[kind]++;
    this.remaining.add(kind);
  }
  /** Demanded kinds go first; otherwise partial pages alternate areas. */
  next(demanded: ReadonlySet<HistoryKind> = new Set()): PreparationTurn | null {
    const kind =
      [...demanded].find((candidate) => this.remaining.has(candidate)) ??
      (this.remaining.has(this.preferred)
        ? this.preferred
        : this.remaining.values().next().value);
    return kind ? { kind, version: this.versions[kind] } : null;
  }
  complete(turn: PreparationTurn, more: boolean): void {
    if (turn.version !== this.versions[turn.kind]) return;
    if (!more) this.remaining.delete(turn.kind);
    this.preferred = turn.kind === 'direct' ? 'groups' : 'direct';
  }
}
