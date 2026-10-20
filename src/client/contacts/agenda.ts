import type { VaultWorkOptions } from '../vault-authority/index.ts';
import { t, currentLanguage } from '../../shared/i18n/index.ts';
import {
  addressBookEntry,
  contactInvitationValue,
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
function newestVersion(a: VaultEntry, b: VaultEntry): number {
  return (
    b.commit.sequence - a.commit.sequence ||
    a.commit.id.localeCompare(b.commit.id)
  );
}
type AgendaSync = Pick<
  VaultSync,
  | 'entries'
  | 'currentHeads'
  | 'heads'
  | 'isRemoved'
  | 'open'
  | 'openMany'
  | 'save'
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
    const query = search.normalize('NFC').toLocaleLowerCase(currentLanguage());
    return [...this.sync.currentHeads().values()]
      .flat()
      .filter(
        (e) =>
          e.change.kind === 'address-book' &&
          e.change.label.toLocaleLowerCase(currentLanguage()).includes(query),
      );
  }
  async open(id: string): Promise<BookVersion> {
    const vault = this.sync.entries.get(id);
    if (!vault || vault.change.kind !== 'address-book')
      throw new Error('Contact version not loaded.');
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
      throw new Error('Create another contact for a different wallet.');
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
      throw new Error("Resolve this contact's versions before saving.");
    await this.sync.save({
      change: {
        version: 1,
        entity,
        kind: 'address-book',
        parents: previous,
        label:
          validated.alias ||
          t('{0} · {1}', [validated.ecosystem, validated.address.slice(0, 12)]),
      },
      value: JSON.stringify(validated),
    });
  }
  /** Bounded opening of encrypted agenda heads, including removal markers. */
  async page(
    after: string | null = null,
    work: VaultWorkOptions = {},
  ): Promise<{ items: BookVersion[]; next: string | null }> {
    const groups = [...this.sync.currentHeads().values()]
      .map((heads) =>
        heads
          .filter(
            (e) =>
              e.change.kind === 'address-book' &&
              !this.sync.isRemoved(e.commit.id),
          )
          .sort(newestVersion),
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
      throw new Error(
        'Contacts have changed. Refresh the list before continuing.',
      );
    const page = groups.slice(offset, offset + 16);
    const items = await this.openGroups(page, work);
    return {
      items,
      next: groups.length > offset + 16 ? page.at(-1)![0]!.change.entity : null,
    };
  }
  /** The canonical wallet entity avoids scanning the agenda during a push. */
  async aliasFor(
    peer: import('../../shared/contacts/index.ts').Peer,
  ): Promise<string> {
    const entity = await walletEntity(peer);
    const heads = this.sync
      .heads(entity)
      .filter(
        (entry) =>
          entry.change.kind === 'address-book' &&
          !this.sync.isRemoved(entry.commit.id),
      )
      .sort(newestVersion);
    if (!heads.length) return '';
    const [version] = await this.openGroups([heads], {});
    if (
      !version ||
      version.contact.removed ||
      walletKey(version.contact) !== walletKey(peer) ||
      (version.contact.accountId !== null &&
        version.contact.accountId !== peer.accountId)
    )
      return '';
    return version.contact.alias;
  }
  private async openGroups(
    groups: VaultEntry[][],
    work: VaultWorkOptions,
  ): Promise<BookVersion[]> {
    if (groups.some((heads) => heads.length > 16))
      throw new Error(
        "Resolve this contact's versions before opening the list.",
      );
    const entries = groups.flat(),
      versions = new Map<string, BookVersion>();
    for (let offset = 0; offset < entries.length; offset += 16) {
      const page = entries.slice(offset, offset + 16);
      const values = await this.sync.openMany(
        page.map((entry) => entry.commit.id),
        work,
      );
      for (const [index, vault] of page.entries())
        versions.set(vault.commit.id, {
          vault,
          contact: addressBookEntry(JSON.parse(values[index]!) as unknown),
        });
    }
    // Removal wins concurrent copies until an explicit save joins their heads.
    return groups.map((heads) => {
      const opened = heads.map((head) => versions.get(head.commit.id)!);
      return opened.find((version) => version.contact.removed) ?? opened[0]!;
    });
  }
  async remove(
    contact: AddressBookEntry,
    guard: () => void = () => undefined,
  ): Promise<void> {
    await this.save({ ...contact, removed: true }, null, undefined, guard);
  }
}
export function incomingInvitation(
  hash: string,
  origin: string,
): Invitation | null {
  return contactInvitationValue(hash) !== null
    ? readInvitation(origin + '/' + hash, origin)
    : null;
}
