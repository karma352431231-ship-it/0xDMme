import type { Contacts } from '../contacts/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import type { ContactDirectory } from './contact-directory.ts';
import type { Messages } from './controller.ts';

export type ConversationPeer = Peer & { localOnly?: boolean };
interface DirectorySources {
  agenda: Pick<ContactDirectory, 'load' | 'prepare' | 'clear' | 'more'>;
  contacts: Pick<Contacts, 'list'>;
  archivedPeers: Messages['archivedPeers'];
  changed: (peers: readonly ConversationPeer[]) => void;
}
/** Bounded directory pages. The agenda never grants conversation authority. */
export class MessageDirectory {
  private values: readonly ConversationPeer[] = [];
  private generation = 0;
  private archivedAfter: string | null = null;
  private remoteMore = true;
  private archivedMore = true;
  private readonly sources: DirectorySources;
  constructor(sources: DirectorySources) {
    this.sources = sources;
  }
  get peers(): readonly ConversationPeer[] {
    return this.values;
  }
  hasMore(online: boolean): boolean {
    return (
      this.sources.agenda.more ||
      this.archivedMore ||
      (online && this.remoteMore)
    );
  }
  clear(): void {
    this.generation++;
    this.sources.agenda.clear();
    this.values = [];
    this.archivedAfter = null;
    this.remoteMore = this.archivedMore = true;
  }
  private guard(current: number): void {
    if (current !== this.generation) throw new Error('Sessão alterada.');
  }
  async refresh(more = false, online = true): Promise<void> {
    const current = this.generation;
    await this.sources.agenda.load(more);
    this.guard(current);
    if (!more) {
      this.archivedAfter = null;
      this.archivedMore = true;
      if (online) this.remoteMore = true;
    }
    const page =
      online && this.remoteMore
        ? await this.sources.contacts.list('approved', more)
        : { items: [], next: null };
    this.guard(current);
    const local = this.archivedMore
      ? await this.sources.archivedPeers(this.archivedAfter)
      : { items: [], next: null };
    this.guard(current);
    const peers = this.combine(page.items, local.items, more || !online);
    await this.sources.agenda.prepare(peers);
    this.guard(current);
    this.archivedAfter = local.next;
    this.archivedMore = local.next !== null;
    if (online) this.remoteMore = page.next !== null;
    this.values = peers;
    this.sources.changed(peers);
  }
  private combine(
    approved: readonly Peer[],
    archived: readonly Peer[],
    retain: boolean,
  ): ConversationPeer[] {
    const combined = new Map<string, ConversationPeer>(
      retain ? this.values.map((peer) => [peer.accountId, peer]) : [],
    );
    for (const peer of archived)
      if (!combined.has(peer.accountId))
        combined.set(peer.accountId, { ...peer, localOnly: true });
    for (const peer of approved) combined.set(peer.accountId, peer);
    return [...combined.values()];
  }
}
