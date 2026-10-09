import { object } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import { messageItems } from './history.ts';
import type { Api, MessageItem } from './history.ts';

interface Scan {
  identity: string;
  after: number;
  complete: boolean;
  items: MessageItem[];
  profiles: Map<string, MessageItem>;
}
/** Bounded rounds retain only the selected window. Nothing becomes visible
 * until every metadata page in the same server snapshot has been checked. */
export class MessageIndex {
  private scan: Scan | null = null;
  reset(): void {
    this.scan = null;
  }
  async read(c: {
    snapshot: unknown;
    selected: string | null;
    before: number | null;
    api: Api;
    deleted: (item: MessageItem) => Promise<void>;
  }): Promise<MessageItem[]> {
    const identity = canonical([c.snapshot, c.selected, c.before]);
    if (this.scan?.identity !== identity)
      this.scan = {
        identity,
        after: 0,
        complete: false,
        items: [],
        profiles: new Map(),
      };
    const scan = this.scan;
    const deadline = Date.now() + 45000;
    for (
      let round = 0;
      !scan.complete && round < 8 && Date.now() < deadline;
      round++
    ) {
      const page = messageItems(
        await c.api('page', { snapshot: c.snapshot, after: scan.after }),
      );
      assertPage(page, scan.after);
      for (const item of page.items) {
        if (item.deleted) await c.deleted(item);
        this.collect(scan, c, item);
        scan.after = item.sequence;
      }
      scan.complete = page.next === null;
      scan.after = page.next ?? scan.after;
    }
    if (!scan.complete)
      throw new Error(
        'Índice de mensagens parcialmente conferido. Continue sincronizando; o histórico permanece oculto.',
      );
    return [
      ...[...scan.profiles.values()].filter((item) => !item.deleted),
      ...scan.items,
    ];
  }
  private collect(
    scan: Scan,
    c: { selected: string | null; before: number | null },
    item: MessageItem,
  ): void {
    if (![item.sender, item.recipient].includes(c.selected ?? '')) return;
    if (item.kind === 'profile') {
      scan.profiles.set(item.sender, item);
      return;
    }
    if (
      item.relation ||
      item.deleted ||
      (c.before !== null && item.sequence >= c.before)
    )
      return;
    // A page retried after an interrupted deletion is idempotent.
    if (scan.items.some((old) => old.id === item.id)) return;
    scan.items.push(item);
    if (scan.items.length > 16) scan.items.shift();
  }
}
function assertPage(
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
      if (!view || view.archived || view.state === 'Suspensa') continue;
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
