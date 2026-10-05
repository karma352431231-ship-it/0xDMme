import {
  addressBookEntry,
  invitation,
  invitationLink,
  readInvitation,
} from '../../shared/contacts/index.ts';
import type {
  AddressBookEntry,
  Invitation,
  WalletContact,
} from '../../shared/contacts/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import type { VaultSync, VaultEntry } from '../vault-sync/index.ts';
export interface BookVersion {
  vault: VaultEntry;
  contact: AddressBookEntry;
}
type AgendaSync = Pick<
  VaultSync,
  'entries' | 'currentHeads' | 'heads' | 'isRemoved' | 'open' | 'save'
>;
export function walletKey(wallet: WalletContact): string {
  return `${wallet.ecosystem}:${wallet.address}`;
}
export async function walletEntity(
  wallet: Pick<AddressBookEntry, 'ecosystem' | 'address'>,
): Promise<string> {
  const hash = await digest(
    canonical(['0xdmme-private-agenda', 1, wallet.ecosystem, wallet.address]),
  );
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export class AddressBook {
  private readonly sync: AgendaSync;
  constructor(sync: AgendaSync) {
    this.sync = sync;
  }
  versions(search = ''): VaultEntry[] {
    const query = search.normalize('NFC').toLocaleLowerCase('pt-BR');
    return [...this.sync.currentHeads().values()]
      .flat()
      .filter(
        (e) =>
          e.change.kind === 'address-book' &&
          e.change.label.toLocaleLowerCase('pt-BR').includes(query),
      );
  }
  async open(id: string): Promise<BookVersion> {
    const vault = this.sync.entries.get(id);
    if (!vault || vault.change.kind !== 'address-book')
      throw new Error('Versão de contato não carregada.');
    return {
      vault,
      contact: addressBookEntry(
        JSON.parse(await this.sync.open(id)) as unknown,
      ),
    };
  }
  async save(
    contact: AddressBookEntry,
    editing: BookVersion | null,
    parents?: string[],
    guard: () => void = () => undefined,
  ): Promise<void> {
    const validated = addressBookEntry(contact);
    if (
      editing &&
      canonical([editing.contact.ecosystem, editing.contact.address]) !==
        canonical([validated.ecosystem, validated.address])
    )
      throw new Error('Crie outro contato para outra wallet.');
    const entity =
      editing?.vault.change.entity ?? (await walletEntity(validated));
    guard();
    const previous =
      parents ??
      (editing
        ? [editing.vault.commit.id]
        : this.sync
            .heads(entity)
            .filter(
              (e) =>
                e.change.kind === 'address-book' &&
                !this.sync.isRemoved(e.commit.id),
            )
            .map((e) => e.commit.id));
    if (previous.length > 16)
      throw new Error('Resolva as versões deste contato antes de salvar.');
    await this.sync.save({
      change: {
        version: 1,
        entity,
        kind: 'address-book',
        parents: previous,
        label:
          validated.alias ||
          `${validated.ecosystem} · ${validated.address.slice(0, 12)}`,
      },
      value: JSON.stringify(validated),
    });
  }
  /** Bounded opening of encrypted agenda heads, including removal markers. */
  async page(
    after: string | null = null,
  ): Promise<{ items: BookVersion[]; next: string | null }> {
    const groups = [...this.sync.currentHeads().values()]
      .map((heads) =>
        heads
          .filter(
            (e) =>
              e.change.kind === 'address-book' &&
              !this.sync.isRemoved(e.commit.id),
          )
          .sort(
            (a, b) =>
              b.commit.sequence - a.commit.sequence ||
              a.commit.id.localeCompare(b.commit.id),
          ),
      )
      .filter((heads) => heads.length > 0)
      .sort(
        (a, b) =>
          b[0]!.commit.sequence - a[0]!.commit.sequence ||
          a[0]!.change.entity.localeCompare(b[0]!.change.entity),
      );
    const offset =
      after === null
        ? 0
        : groups.findIndex((heads) => heads[0]!.change.entity === after) + 1;
    if (after !== null && offset === 0)
      throw new Error('A agenda mudou. Atualize a lista antes de continuar.');
    const page = groups.slice(offset, offset + 16),
      items: BookVersion[] = [];
    for (const heads of page) {
      if (heads.length > 16)
        throw new Error(
          'Resolva as versões deste contato antes de abrir a lista.',
        );
      const versions: BookVersion[] = [];
      for (const head of heads) versions.push(await this.open(head.commit.id));
      // Removal wins concurrent copies until an explicit save joins their heads.
      items.push(
        versions.find((version) => version.contact.removed) ?? versions[0]!,
      );
    }
    return {
      items,
      next: groups.length > offset + 16 ? page.at(-1)![0]!.change.entity : null,
    };
  }
  async remove(
    contact: AddressBookEntry,
    guard: () => void = () => undefined,
  ): Promise<void> {
    await this.save({ ...contact, removed: true }, null, undefined, guard);
  }
  async savedInvite(
    origin: string,
    expectedHash: string | null,
  ): Promise<string | null> {
    if (!expectedHash) return null;
    const candidates = [...this.sync.currentHeads().values()]
      .flat()
      .filter((e) => e.change.kind === 'contact-invite');
    if (candidates.length > 16)
      throw new Error(
        'Há conflitos de convites. Revogue o link e resolva as versões no cofre.',
      );
    for (const entry of candidates) {
      const stored = invitation(
        JSON.parse(await this.sync.open(entry.commit.id)) as unknown,
      );
      if ((await digest(stored.token)) === expectedHash)
        return invitationLink(origin, stored);
    }
    return null;
  }
  async saveInvite(value: Invitation): Promise<void> {
    const previous = [...this.sync.currentHeads().values()]
      .flat()
      .filter((e) => e.change.kind === 'contact-invite');
    const entity = previous[0]?.change.entity ?? crypto.randomUUID();
    const parents = previous
      .filter((e) => e.change.entity === entity)
      .map((e) => e.commit.id);
    if (parents.length > 16)
      throw new Error(
        'Resolva os conflitos do convite no cofre antes de criar outro.',
      );
    await this.sync.save({
      change: {
        version: 1,
        entity,
        kind: 'contact-invite',
        parents,
        label: 'Link particular de convite',
      },
      value: JSON.stringify(invitation(value)),
    });
  }
}
export function incomingInvitation(
  hash: string,
  origin: string,
): Invitation | null {
  return hash.startsWith('#contatos?convite=')
    ? readInvitation(origin + '/' + hash, origin)
    : null;
}
