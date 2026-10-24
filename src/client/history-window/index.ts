/**
 * How far back an open conversation reaches (owner request, 24/10/2026). A
 * conversation opens on its latest page. Scrolling to the top lowers its
 * floor by one page, and from then on its window keeps every message from the
 * floor to the newest, so live changes, removals, receipts and media checks
 * still cover everything shown. Floors last for the page's lifetime (a reload
 * starts over) and are cleared with the session.
 */
export const historyPage = 16;
/** Roots one window may hold; older history stops loading beyond this. */
export const historyRootLimit = 512;
/** Edits and reactions verified per root, as the latest page always allowed. */
const relationsPerRoot = 3;
const conversationLimit = 64;

/** null: the latest page only. A number: every root from that sequence on. */
export type HistoryFloor = number | null;

/** The roots a window keeps, from ordered roots (oldest first). */
export function windowRoots<T>(
  ordered: readonly T[],
  floor: HistoryFloor,
  sequence: (root: T) => number | undefined,
): T[] {
  if (floor === null) return ordered.slice(-historyPage);
  return ordered
    .filter((root) => (sequence(root) ?? 0) >= floor)
    .slice(-historyRootLimit);
}

/** Relations a window of `roots` may carry before it must be read again. */
export function relationBudget(roots: number): number {
  return relationsPerRoot * Math.max(historyPage, roots);
}

interface WindowRow {
  id: string;
  kind?: string;
  sequence?: number;
  relation?: { id: string };
}
function isRoot(row: WindowRow): boolean {
  return row.kind !== 'profile' && !row.relation;
}
/** Sequence of the oldest message (not edit, reaction or profile card). */
export function oldestRoot(rows: readonly WindowRow[]): number | null {
  let oldest: number | null = null;
  for (const row of rows)
    if (isRoot(row) && row.sequence !== undefined)
      oldest = oldest === null ? row.sequence : Math.min(oldest, row.sequence);
  return oldest;
}
function rootCount(rows: readonly WindowRow[]): number {
  return rows.filter(isRoot).length;
}
/** Roots from the floor on, their relations and every profile row. Without a
 * floor the rows are returned as they are. */
export function fromFloor<T extends WindowRow>(
  rows: readonly T[],
  floor: HistoryFloor,
): T[] {
  if (floor === null) return [...rows];
  const roots = rows
    .filter(isRoot)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const kept = new Set(
    windowRoots(roots, floor, (root) => root.sequence).map((root) => root.id),
  );
  return rows.filter(
    (row) => row.kind === 'profile' || kept.has(row.relation?.id ?? row.id),
  );
}

type Step = 'stop' | 'complete' | 'behind' | 'older';
/** behind: the window has not reached its floor yet; older: one more page
 * was asked for; complete: nothing further back can be read. */
function nextStep(
  rows: readonly WindowRow[],
  floor: HistoryFloor,
  older: boolean,
): Step {
  const oldest = oldestRoot(rows);
  if (oldest !== null && floor !== null && oldest > floor) return 'behind';
  if (!older) return 'stop';
  return oldest === null || rootCount(rows) >= historyRootLimit
    ? 'complete'
    : 'older';
}

/**
 * Reads older pages until a window that was read from its latest page reaches
 * its floor again, plus one page further back when `older` asks for it. `page`
 * returns the verified rows of the page just before a root sequence; `merge`
 * joins it under the rows already read. `complete` is true once a read found
 * nothing further back or the window is full, null when nothing was learned.
 */
export async function reachFloor<T extends WindowRow>(input: {
  rows: readonly T[];
  floor: HistoryFloor;
  older: boolean;
  page: (before: number) => Promise<T[]>;
  merge: (newer: readonly T[], older: readonly T[]) => T[];
}): Promise<{ rows: T[]; floor: HistoryFloor; complete: boolean | null }> {
  let rows = [...input.rows],
    floor = input.floor,
    older = input.older,
    complete: boolean | null = null;
  for (let pages = 0; pages <= historyRootLimit / historyPage; pages++) {
    const step = nextStep(rows, floor, older);
    if (step === 'stop') break;
    if (step === 'complete') {
      complete = true;
      break;
    }
    const oldest = oldestRoot(rows)!,
      page = await input.page(oldest),
      reached = oldestRoot(page);
    rows = input.merge(rows, page);
    if (reached === null) {
      // Older messages may have been removed since the floor was set.
      if (step === 'behind') floor = oldest;
      if (older) complete = true;
      break;
    }
    if (step === 'older') {
      floor = reached;
      older = false;
      complete = false;
    }
  }
  return { rows: fromFloor(rows, floor), floor, complete };
}

/** Floors of the conversations opened in this page, by conversation id. */
export class HistoryFloors {
  private readonly floors = new Map<
    string,
    { floor: HistoryFloor; complete: boolean }
  >();
  floor(conversation: string): HistoryFloor {
    return this.floors.get(conversation)?.floor ?? null;
  }
  /** True once an older read found nothing further back. */
  complete(conversation: string): boolean {
    return this.floors.get(conversation)?.complete ?? false;
  }
  /** Records what a read learned; `complete: null` keeps the previous answer. */
  update(
    conversation: string,
    value: { floor: HistoryFloor; complete: boolean | null },
  ): void {
    const complete = value.complete ?? this.complete(conversation);
    this.floors.delete(conversation);
    if (value.floor === null && !complete) return;
    this.floors.set(conversation, { floor: value.floor, complete });
    while (this.floors.size > conversationLimit)
      this.floors.delete(this.floors.keys().next().value!);
  }
  clear(): void {
    this.floors.clear();
  }
}

/**
 * Read marks and receipts for a deep window, a page of ids per request (the
 * server's batch limit): the latest page on every read, each older id once,
 * since a receipt never goes back to unread. Older states are kept to show
 * them again after the window is read anew; the session clears them.
 */
export class WindowReceipts<S> {
  private readonly asked = new Set<string>();
  private readonly states = new Map<string, S>();
  /** Ids to send now, oldest batch last; empty when there is nothing to ask. */
  batches(ids: readonly string[]): string[][] {
    const latest = ids.slice(-historyPage),
      older = ids.slice(0, -historyPage).filter((id) => !this.asked.has(id)),
      batches = latest.length ? [latest] : [];
    for (let offset = 0; offset < older.length; offset += historyPage)
      batches.push(older.slice(offset, offset + historyPage));
    return batches;
  }
  answered(
    ids: readonly string[],
    states: ReadonlyMap<string, S> = new Map(),
  ): void {
    if (this.asked.size > historyRootLimit * 8) this.clear();
    for (const id of ids) {
      this.asked.add(id);
      const state = states.get(id);
      if (state !== undefined) this.states.set(id, state);
    }
  }
  state(id: string): S | undefined {
    return this.states.get(id);
  }
  clear(): void {
    this.asked.clear();
    this.states.clear();
  }
}
