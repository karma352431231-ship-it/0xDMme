import { t } from '../../shared/i18n/index.ts';
import { messageStates } from '../message-state/index.ts';
import { readMessageDelta } from './delta.ts';
import { object } from '../../shared/account/index.ts';
import { canonical, fingerprint } from '../../shared/devices/index.ts';
import { messageItems } from './history.ts';
import type { Api, MessageItem } from './history.ts';

/** A bounded scan needs another turn; its already verified pages remain valid
 * only for the same snapshot/account/window. No partial history is publishable. */
export class IncompleteMessageIndex extends Error {
  constructor() {
    super(
      t(
        'Índice de mensagens parcialmente conferido. Continue sincronizando; o histórico permanece oculto.',
      ),
    );
  }
}

interface Scan {
  identity: string;
  snapshot: unknown;
  selected: string | null;
  after: number;
  complete: boolean;
  windows: Map<
    string,
    { items: MessageItem[]; profiles: Map<string, MessageItem> }
  >;
  count: number;
  overflow: boolean;
}
/** One complete metadata scan serves navigation across conversations. The catalog
 * keeps at most 4096 recent entries; evicted windows require another full scan.
 * Nothing becomes visible before all deletions in the snapshot are checked. */
export class MessageIndex {
  private scan: Scan | null = null;
  private transition: {
    from: unknown;
    snapshot: unknown;
    peers: string[];
  } | null = null;
  reset(): void {
    this.scan = null;
    this.transition = null;
  }
  async read(c: {
    snapshot: unknown;
    account: string;
    selected: string | null;
    before: number | null;
    api: Api;
    deleted: (item: MessageItem) => Promise<void>;
  }): Promise<MessageItem[]> {
    await this.advance(c);
    const scan = this.start(c);
    const deadline = Date.now() + 45000;
    for (
      let round = 0;
      !scan.complete && round < 8 && Date.now() < deadline;
      round++
    ) {
      const page = messageItems(
        await c.api('page', { snapshot: c.snapshot, after: scan.after }),
      );
      assertMessagePage(page, scan.after);
      for (const item of page.items) {
        if (item.deleted) await c.deleted(item);
        this.collect(scan, c, item);
        scan.after = item.sequence;
      }
      scan.complete = page.next === null;
      scan.after = page.next ?? scan.after;
    }
    if (!scan.complete) throw new IncompleteMessageIndex();
    return this.window(scan, c.selected);
  }
  /** Background callers have already verified deletions, durable receipts and
   * the final snapshot. A partial catalog is never exposed by read(). */
  rememberConfirmedPage(c: {
    snapshot: unknown;
    account: string;
    selected: string | null;
    after: number;
    page: ReturnType<typeof messageItems>;
  }): void {
    const scan = this.start({ ...c, before: null });
    if (scan.after !== c.after || scan.complete) return;
    assertMessagePage(c.page, c.after);
    for (const item of c.page.items)
      this.collect(scan, { ...c, before: null }, item);
    scan.after = c.page.next ?? c.page.items.at(-1)?.sequence ?? scan.after;
    scan.complete = c.page.next === null;
  }
  private async advance(c: {
    snapshot: unknown;
    account: string;
    selected: string | null;
    before: number | null;
    api: Api;
    deleted: (item: MessageItem) => Promise<void>;
  }): Promise<void> {
    const scan = this.scan;
    if (
      !scan?.complete ||
      c.before !== null ||
      scan.overflow ||
      scan.identity === canonical([c.snapshot, c.account, c.before])
    )
      return;
    const expected = canonical([scan.snapshot, c.account, null]);
    if (scan.identity !== expected) return;
    const items = await readMessageDelta(c.api, scan.snapshot, c.snapshot);
    if (items === null) return;
    for (const item of items) {
      messagePeer(c.account, item);
      if (item.deleted) await c.deleted(item);
    }
    this.rememberChanges({ ...c, from: scan.snapshot, items });
  }
  /** Called only after the background reader has verified removals, durable
   * packet writes/receipts and the current snapshot's final confirmation. */
  rememberChanges(c: {
    from: unknown;
    snapshot: unknown;
    account: string;
    selected: string | null;
    items: MessageItem[];
  }): void {
    const scan = this.scan;
    if (
      !scan?.complete ||
      scan.overflow ||
      scan.identity !== canonical([c.from, c.account, null])
    )
      return;
    const updated: Scan = {
      ...scan,
      identity: canonical([c.snapshot, c.account, null]),
      snapshot: c.snapshot,
      windows: new Map(
        [...scan.windows].map(([peer, window]) => [
          peer,
          { items: [...window.items], profiles: new Map(window.profiles) },
        ]),
      ),
    };
    for (const item of c.items) {
      const peer = messagePeer(c.account, item),
        window = updated.windows.get(peer);
      if (window) {
        const before = window.items.length;
        window.items = window.items.filter((row) => row.id !== item.id);
        updated.count -= before - window.items.length;
      }
      this.collect(updated, { ...c, before: null }, item);
    }
    this.scan = updated;
    this.transition = {
      from: c.from,
      snapshot: c.snapshot,
      peers: [...new Set(c.items.map((item) => messagePeer(c.account, item)))],
    };
  }
  changesFor(snapshot: unknown) {
    return this.transition &&
      canonical(this.transition.snapshot) === canonical(snapshot)
      ? this.transition
      : null;
  }
  private start(c: {
    snapshot: unknown;
    account: string;
    selected: string | null;
    before: number | null;
  }): Scan {
    const identity = canonical([c.snapshot, c.account, c.before]);
    if (
      this.scan?.identity !== identity ||
      (this.scan.overflow && this.scan.selected !== c.selected)
    ) {
      this.transition = null;
      this.scan = {
        identity,
        snapshot: c.snapshot,
        selected: c.selected,
        after: 0,
        complete: false,
        windows: new Map(),
        count: 0,
        overflow: false,
      };
    }
    return this.scan;
  }
  private window(scan: Scan, selected: string | null): MessageItem[] {
    const window = scan.windows.get(selected ?? '');
    if (!window) return [];
    // Touch the selected window so overflow preferentially removes idle peers.
    scan.windows.delete(selected ?? '');
    scan.windows.set(selected ?? '', window);
    return [
      ...[...window.profiles.values()].filter((item) => !item.deleted),
      ...window.items,
    ];
  }
  private collect(
    scan: Scan,
    c: { account: string; selected: string | null; before: number | null },
    item: MessageItem,
  ): void {
    const peer = messagePeer(c.account, item);
    if (item.kind !== 'profile' && !baseItem(item, c.before)) return;
    let window = scan.windows.get(peer);
    if (!window) {
      window = { items: [], profiles: new Map() };
      scan.windows.set(peer, window);
    }
    const previous = window.items.length + window.profiles.size;
    collectWindow(window, item);
    scan.count += window.items.length + window.profiles.size - previous;
    this.trim(scan, c.selected);
  }
  private trim(scan: Scan, selected: string | null): void {
    while (scan.count > 4096) {
      const oldest = [...scan.windows.keys()].find((id) => id !== selected);
      if (oldest === undefined) break;
      const removed = scan.windows.get(oldest)!;
      scan.count -= removed.items.length + removed.profiles.size;
      scan.windows.delete(oldest);
      scan.overflow = true;
    }
  }
}
function baseItem(item: MessageItem, before: number | null): boolean {
  return (
    !item.relation &&
    !item.deleted &&
    (before === null || item.sequence < before)
  );
}
function collectWindow(
  window: { items: MessageItem[]; profiles: Map<string, MessageItem> },
  item: MessageItem,
): void {
  if (item.kind === 'profile') {
    if ((window.profiles.get(item.sender)?.sequence ?? 0) <= item.sequence)
      window.profiles.set(item.sender, item);
    return;
  }
  if (!window.items.some((old) => old.id === item.id)) window.items.push(item);
  window.items.sort((a, b) => a.sequence - b.sequence);
  if (window.items.length > 16) window.items.shift();
}
export function assertMessagePage(
  page: ReturnType<typeof messageItems>,
  after: number,
): void {
  let previous = after;
  for (const item of page.items) {
    if (item.sequence <= previous)
      throw new Error('Ordem do índice divergente.');
    previous = item.sequence;
  }
  if (page.next !== null && (page.next !== previous || page.next <= after))
    throw new Error('Paginação de mensagens divergente.');
}

interface VerifiedView {
  id: string;
  hash: string;
  state: string;
  archived?: boolean;
}

/** Only the last fully confirmed online window is reusable. A fresh authenticated
 * index must still prove the same immutable packet and this device's receipt.
 * Deletions, delivery and the final snapshot check remain the caller's job. */
export class VerifiedWindow<T extends VerifiedView> {
  private scope = '';
  private entries = new Map<string, { identity: string; view: T }>();
  clear(): void {
    this.scope = '';
    this.entries.clear();
  }
  remember(snapshot: unknown, items: MessageItem[], views: T[]): void {
    this.clear();
    // 16 base messages, two profiles and at most 48 relations.
    if (items.length > 66) throw new Error('Janela verificada excedida.');
    this.scope = authorityScope(snapshot);
    const byId = new Map(views.map((view) => [view.id, view]));
    for (const item of items) {
      const view = byId.get(item.id);
      if (!view || view.archived || view.state === messageStates.suspended)
        continue;
      if (item.deleted || item.hash !== view.hash) continue;
      this.entries.set(item.id, {
        identity: packetIdentity(item),
        view: { ...view },
      });
    }
  }
  read(snapshot: unknown, item: MessageItem): T | null {
    if (item.deleted || item.status !== 'received') return null;
    if (this.scope !== authorityScope(snapshot)) return null;
    const entry = this.entries.get(item.id);
    return entry?.identity === packetIdentity(item) ? { ...entry.view } : null;
  }
}

function authorityScope(snapshot: unknown): string {
  const state = object(snapshot);
  return canonical([state['directory'], state['contacts']]);
}
function packetIdentity(item: MessageItem): string {
  return canonical([
    item.id,
    item.hash,
    item.kind,
    item.sender,
    item.recipient,
    item.sequence,
    item.sender_revision,
    item.recipient_revision,
    item.relation ?? null,
  ]);
}

export function messagePeer(account: string, item: MessageItem): string {
  if (item.sender === account) return item.recipient;
  if (item.recipient === account) return item.sender;
  throw new Error('Mensagem fora da conta autorizada.');
}

/** A root-sealed receipt binds the verified packet, content hash and consent scope.
 * A durable receipt alone never authorizes online reuse after a scope change. */
export function verifiedReceipt(
  snapshot: unknown,
  item: MessageItem,
  payloadHash: string,
): string {
  return JSON.stringify({
    scope: authorityScope(snapshot),
    identity: packetIdentity(item),
    payloadHash,
  });
}
export function verifiedReceiptHash(
  receipt: string,
  snapshot: unknown,
  item: MessageItem,
): string | null {
  if (item.deleted || item.status !== 'received') return null;
  const data = object(JSON.parse(receipt) as unknown);
  if (typeof data['scope'] !== 'string' || typeof data['identity'] !== 'string')
    throw new Error('Cópia verificada inválida.');
  const payloadHash = fingerprint(data['payloadHash']);
  return data['scope'] === authorityScope(snapshot) &&
    data['identity'] === packetIdentity(item)
    ? payloadHash
    : null;
}

/** Commits a page cursor only after its durable writes, receipts and confirmation.
 * Cancellation/retry revisits the same page; a different snapshot restarts it. */
export class MessagePrefetch {
  private snapshot: unknown = null;
  get completedSnapshot(): unknown {
    return this.complete ? this.snapshot : null;
  }
  finish(snapshot: unknown): void {
    this.snapshot = snapshot;
    this.identity = canonical(snapshot);
    this.after = 0;
    this.complete = true;
  }
  private identity = '';
  private after = 0;
  private complete = false;
  reset(): void {
    this.snapshot = null;
    this.identity = '';
    this.after = 0;
    this.complete = false;
  }
  cursor(snapshot: unknown): number | null {
    const identity = canonical(snapshot);
    if (identity !== this.identity) {
      this.snapshot = snapshot;
      this.identity = identity;
      this.after = 0;
      this.complete = false;
    }
    return this.complete ? null : this.after;
  }
  commit(snapshot: unknown, page: ReturnType<typeof messageItems>): void {
    if (canonical(snapshot) !== this.identity)
      throw new Error('Sincronização alterada.');
    assertMessagePage(page, this.after);
    this.after = page.next ?? page.items.at(-1)?.sequence ?? this.after;
    this.complete = page.next === null;
  }
}
