import { object } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import type { MessageItem } from './history.ts';

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
