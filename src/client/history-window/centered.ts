import type { HistorySlice } from '../../shared/messages/index.ts';
import { historyPage, historyRootLimit } from './limits.ts';

interface Row {
  id: string;
  sequence?: number;
  kind?: string;
  relation?: { id: string };
}
export type HistoryDirection = HistorySlice['direction'];
interface State<T> {
  cut: string;
  rows: readonly T[];
  edges: Record<HistoryDirection, boolean>;
}

function root(row: Row): boolean {
  return row.kind !== 'profile' && !row.relation;
}
function edge(
  rows: readonly Row[],
  direction: HistoryDirection,
): number | null {
  const compare = direction === 'older' ? Math.min : Math.max;
  return rows.reduce<number | null>(
    (last, row) =>
      root(row) && row.sequence !== undefined
        ? compare(last ?? row.sequence, row.sequence)
        : last,
    null,
  );
}
function join<T extends Row>(left: readonly T[], right: readonly T[]): T[] {
  return [
    ...new Map([...left, ...right].map((row) => [row.id, row])).values(),
  ].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

/** One temporary view centered on a selected message. Only the history reader
 * can commit a proposal, after it confirms that proposal's signed cut. */
export class CenteredHistory<T extends Row> {
  readonly anchor: number;
  private state: State<T> | null = null;
  private requested: HistoryDirection | null = null;
  constructor(anchor: number) {
    this.anchor = anchor;
  }
  available(direction: HistoryDirection): boolean {
    return this.state?.edges[direction] ?? false;
  }
  request(direction: HistoryDirection): boolean {
    if (this.requested || !this.available(direction)) return false;
    this.requested = direction;
    return true;
  }
  cancelRequest(): void {
    this.requested = null;
  }
  forget(): void {
    this.state = null;
    this.cancelRequest();
  }
  async stage(input: {
    cut: string;
    read: (range: HistorySlice) => Promise<readonly T[]>;
  }): Promise<{ rows: T[]; commit: () => void }> {
    const { cut, read } = input;
    const direction = this.requested;
    const previous = this.state?.cut === cut ? this.state : null;
    const state = previous
      ? await this.extend(previous, direction, read)
      : await this.open(cut, read);
    return {
      rows: [...state.rows],
      commit: () => {
        this.state = state;
        if (this.requested === direction) this.requested = null;
      },
    };
  }
  private async open(
    cut: string,
    read: (range: HistorySlice) => Promise<readonly T[]>,
  ): Promise<State<T>> {
    const older = await read({
      direction: 'older',
      cursor: this.anchor + 1,
      limit: 13,
    });
    const newer = await read({
      direction: 'newer',
      cursor: this.anchor,
      limit: 12,
    });
    return {
      cut,
      rows: join(older, newer),
      edges: { older: older.some(root), newer: newer.some(root) },
    };
  }
  private async extend(
    state: State<T>,
    direction: HistoryDirection | null,
    read: (range: HistorySlice) => Promise<readonly T[]>,
  ): Promise<State<T>> {
    if (!direction) return state;
    const cursor = edge(state.rows, direction);
    if (cursor === null) return state;
    const page = await read({ direction, cursor, limit: historyPage });
    const window = boundedRows(join(state.rows, page), direction);
    const edges = { ...state.edges, [direction]: page.some(root) };
    if (window.trimmed) edges[direction === 'older' ? 'newer' : 'older'] = true;
    return {
      ...state,
      rows: window.rows,
      edges,
    };
  }
}
function boundedRows<T extends Row>(
  rows: T[],
  direction: HistoryDirection,
): { rows: T[]; trimmed: boolean } {
  const roots = rows.filter(root);
  if (roots.length <= historyRootLimit) return { rows, trimmed: false };
  const visible =
    direction === 'older'
      ? roots.slice(0, historyRootLimit)
      : roots.slice(-historyRootLimit);
  const ids = new Set(visible.map((row) => row.id));
  return {
    rows: rows.filter(
      (row) => row.kind === 'profile' || ids.has(row.relation?.id ?? row.id),
    ),
    trimmed: true,
  };
}
