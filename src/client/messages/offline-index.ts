import { localPage } from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
export type CachedText = LocalCipher & {
  peer: string;
  sequence: number;
  hash: string;
  own: boolean;
  kind?: 'text' | 'attachment';
};
/** Bounded cache scan, independent of remote verification. Only explicit offline
 * viewing may publish it; reconnect always closes it before applying deletions. */
export class OfflineIndex {
  private scan: {
    identity: string;
    after: string | null;
    rows: CachedText[];
    complete: boolean;
  } | null = null;
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
      this.scan = { identity, after: null, rows: [], complete: false };
    const scan = this.scan;
    for (let page = 0; page < 8 && !scan.complete; page++) {
      const result = await localPage<CachedText>(
        c.account,
        'cache:',
        scan.after,
      );
      c.guard();
      for (const { value } of result.items) {
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
    return scan.rows;
  }
}
function selectedRow(
  value: CachedText,
  c: { peer: string | null; before: number | null },
): boolean {
  return (
    value.peer === c.peer && (c.before === null || value.sequence < c.before)
  );
}
