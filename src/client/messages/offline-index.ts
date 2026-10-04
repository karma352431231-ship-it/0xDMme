import { localPage } from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import type { MessageRelation } from '../../shared/daily/index.ts';
export type CachedText = LocalCipher & {
  relation?: MessageRelation;
  peer: string;
  sequence: number;
  hash: string;
  own: boolean;
  kind?: 'text' | 'attachment';
};
/** Bounded cache scan, independent of remote verification. Only explicit offline
 * viewing may publish it; reconnect always closes it before applying deletions. */
interface Scan {
  identity: string;
  after: string | null;
  rows: CachedText[];
  complete: boolean;
  relationAfter: string | null;
  relations: Map<string, CachedText>;
  relationsComplete: boolean;
}
interface ReadContext {
  account: string;
  peer: string | null;
  before: number | null;
  guard: () => void;
}
export class OfflineIndex {
  private scan: Scan | null = null;
  reset(): void {
    this.scan = null;
  }
  async read(c: {
    account: string;
    peer: string | null;
    before: number | null;
    guard: () => void;
  }): Promise<CachedText[]> {
    const identity = JSON.stringify([c.account, c.peer, c.before]);
    if (this.scan?.identity !== identity)
      this.scan = {
        identity,
        after: null,
        rows: [],
        complete: false,
        relationAfter: null,
        relations: new Map(),
        relationsComplete: false,
      };
    const scan = this.scan;
    await this.readBase(scan, c);
    await this.readRelations(scan, c);
    return [...scan.rows, ...scan.relations.values()].sort(
      (a, b) => a.sequence - b.sequence,
    );
  }
  private async readBase(scan: Scan, c: ReadContext): Promise<void> {
    for (let page = 0; page < 8 && !scan.complete; page++) {
      const result = await localPage<CachedText>(
        c.account,
        'cache:',
        scan.after,
      );
      c.guard();
      for (const { value } of result.items) {
        if (value.relation) continue;
        if (!selectedRow(value, c)) continue;
        scan.rows.push(value);
        scan.rows.sort((a, b) => a.sequence - b.sequence);
        if (scan.rows.length > 16) scan.rows.shift();
      }
      scan.after = result.next;
      scan.complete = result.next === null;
    }
    if (!scan.complete)
      throw new Error(
        'Índice local parcialmente carregado. Continue abrindo a cópia local.',
      );
  }
  private async readRelations(scan: Scan, c: ReadContext): Promise<void> {
    const ids = new Set(scan.rows.map((row) => row.id));
    for (let page = 0; page < 8 && !scan.relationsComplete; page++) {
      const result = await localPage<CachedText>(
        c.account,
        'cache:',
        scan.relationAfter,
      );
      c.guard();
      for (const { value } of result.items)
        collectRelation(scan.relations, ids, value);
      scan.relationAfter = result.next;
      scan.relationsComplete = result.next === null;
    }
    if (!scan.relationsComplete)
      throw new Error(
        'Alterações locais parcialmente carregadas; continue abrindo a cópia local.',
      );
  }
}
function collectRelation(
  rows: Map<string, CachedText>,
  ids: Set<string>,
  value: CachedText,
): void {
  const r = value.relation;
  if (!r || !ids.has(r.id)) return;
  const key = JSON.stringify([r.id, r.type, value.own]);
  const old = rows.get(key);
  if (!old || old.sequence < value.sequence) rows.set(key, value);
}
function selectedRow(
  value: CachedText,
  c: { peer: string | null; before: number | null },
): boolean {
  return (
    value.peer === c.peer && (c.before === null || value.sequence < c.before)
  );
}
