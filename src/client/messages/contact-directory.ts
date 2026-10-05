import { AddressBook, walletEntity, walletKey } from '../contacts/index.ts';
import type {
  AddressBookEntry,
  Peer,
  WalletContact,
} from '../../shared/contacts/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';

export interface SavedContact {
  entity: string;
  contact: AddressBookEntry;
}
export function agendaContact(peer: Peer): AddressBookEntry {
  return {
    version: 1,
    ecosystem: peer.ecosystem,
    address: peer.address,
    alias: peer.name,
    accountId: peer.accountId,
    identity: null,
    directory: null,
    identityRevision: 0,
    removed: false,
  };
}
/** The agenda is opened in bounded pages; saving never discovers a wallet. */
export class ContactDirectory {
  private readonly book: AddressBook;
  private generation = 0;
  private contacts = new Map<string, SavedContact>();
  private identities = new Map<string, string>();
  private after: string | null = null;
  more = true;
  constructor(sync: VaultSync) {
    this.book = new AddressBook(sync);
  }
  clear(): void {
    this.generation++;
    this.contacts.clear();
    this.identities.clear();
    this.after = null;
    this.more = true;
  }
  get entries(): readonly SavedContact[] {
    return [...this.contacts.values()];
  }
  get ids(): readonly string[] {
    return [...this.identities.values()];
  }
  find(wallet: WalletContact): SavedContact | undefined {
    return this.contacts.get(walletKey(wallet));
  }
  id(wallet: WalletContact): string {
    const id = this.identities.get(walletKey(wallet));
    if (!id) throw new Error('Wallet ainda não carregada na lista.');
    return id;
  }
  async prepare(peers: readonly Peer[]): Promise<void> {
    const generation = this.generation;
    for (const peer of peers) {
      const key = walletKey(peer);
      if (this.identities.has(key)) continue;
      const id = await walletEntity(peer);
      if (generation !== this.generation) throw new Error('Sessão alterada.');
      this.identities.set(key, id);
    }
  }
  async saved(contact: AddressBookEntry): Promise<void> {
    const generation = this.generation,
      entity = await walletEntity(contact);
    if (generation !== this.generation) throw new Error('Sessão alterada.');
    this.contacts.set(walletKey(contact), { entity, contact });
    this.identities.set(walletKey(contact), entity);
  }
  async load(more = false): Promise<void> {
    if (more && !this.more) return;
    const generation = this.generation;
    const page = await this.book.page(more ? this.after : null);
    if (generation !== this.generation) throw new Error('Sessão alterada.');
    for (const entry of page.items) {
      const entity = entry.vault.change.entity,
        key = walletKey(entry.contact);
      this.contacts.set(key, { entity, contact: entry.contact });
      this.identities.set(key, entity);
    }
    this.after = page.next;
    this.more = page.next !== null;
  }
  async remove(contact: AddressBookEntry): Promise<void> {
    const generation = this.generation;
    await this.book.remove(contact, () => {
      if (generation !== this.generation) throw new Error('Sessão alterada.');
    });
    if (generation !== this.generation) throw new Error('Sessão alterada.');
    await this.saved({ ...contact, removed: true });
  }
}
