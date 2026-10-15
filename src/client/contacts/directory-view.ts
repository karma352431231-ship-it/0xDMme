import { t } from '../../shared/i18n/index.ts';
import type { Peer, ContactList } from '../../shared/contacts/index.ts';
import type { VaultEntry, VaultSync } from '../vault-sync/index.ts';
import type { SavedContact } from './directory.ts';
import { walletKey } from './agenda.ts';
import {
  contactRow,
  contactMenu,
  contactSearchMatches,
  emptyContacts,
} from './view.ts';
import { shortAddress } from '../appearance/index.ts';

type ListedPeer = Peer & { requester: string };
export interface DirectoryItem {
  saved: SavedContact | null;
  peer: ListedPeer | null;
  kind: 'saved' | 'outgoing' | 'approved';
}
function mergePeers(
  items: Map<string, DirectoryItem>,
  peers: readonly ListedPeer[],
  kind: 'outgoing' | 'approved',
): void {
  for (const peer of peers) {
    const key = walletKey(peer);
    items.set(key, { saved: items.get(key)?.saved ?? null, peer, kind });
  }
}
/** A saved alias never grants permission. Accepted and pending identities deduplicate by wallet. */
export function directoryItems(input: {
  saved: readonly SavedContact[];
  approved: readonly ListedPeer[];
  outgoing: readonly ListedPeer[];
  query: string;
}): DirectoryItem[] {
  const items = new Map<string, DirectoryItem>();
  for (const saved of input.saved) {
    if (!saved.contact.removed)
      items.set(walletKey(saved.contact), { saved, peer: null, kind: 'saved' });
  }
  mergePeers(items, input.outgoing, 'outgoing');
  mergePeers(items, input.approved, 'approved');
  return [...items.values()].filter((item) =>
    contactSearchMatches(directorySearch(item), input.query),
  );
}
function directorySearch(item: DirectoryItem): string {
  const identity = item.peer ?? item.saved?.contact;
  if (!identity) return '';
  return [
    item.saved?.contact.alias ?? '',
    item.peer?.name ?? '',
    identity.address,
    identity.ecosystem,
  ].join(' ');
}
interface DirectoryView {
  list: HTMLElement;
  items: readonly DirectoryItem[];
  versions: readonly VaultEntry[];
  sync: Pick<VaultSync, 'heads'>;
  peerRow: (peer: ListedPeer, kind: ContactList) => HTMLLIElement;
  button: (label: string, work: () => Promise<void>) => HTMLButtonElement;
  edit: (id: string, resolve: boolean) => Promise<void>;
}
function savedActions(
  item: DirectoryItem,
  actions: HTMLElement,
  view: DirectoryView,
): void {
  if (!item.saved) return;
  const entity = item.saved.entity;
  const versions = view.versions.filter(
    (entry) => entry.change.entity === entity,
  );
  const latest = versions.toSorted(
    (left, right) => right.commit.sequence - left.commit.sequence,
  )[0];
  if (!latest) return;
  actions.append(
    view.button(t('Abrir contato'), () => view.edit(latest.commit.id, false)),
  );
  if (view.sync.heads(entity).length <= 1) return;
  const menu = contactMenu(
    actions,
    item.saved.contact.alias || shortAddress(item.saved.contact.address),
  );
  for (const version of versions)
    menu.append(
      view.button(t('Resolver usando esta versão'), () =>
        view.edit(version.commit.id, true),
      ),
    );
}
function directoryTitle(item: DirectoryItem): string {
  const identity = item.peer ?? item.saved?.contact;
  return (
    item.saved?.contact.alias ||
    item.peer?.name ||
    shortAddress(identity?.address ?? '')
  );
}
function directoryRow(item: DirectoryItem, view: DirectoryView): HTMLLIElement {
  const title = directoryTitle(item);
  const row = item.peer
    ? view.peerRow(
        { ...item.peer, name: title },
        item.kind === 'approved' ? 'approved' : 'outgoing',
      )
    : contactRow({
        title,
        seed: item.saved!.contact.address,
        detail: shortAddress(item.saved!.contact.address),
      }).row;
  const actions = row.querySelector<HTMLElement>('.contact-row-actions')!;
  savedActions(item, actions, view);
  row.dataset['contactState'] = item.kind;
  if (item.kind !== 'approved') {
    const state = document.createElement('span');
    state.className = 'contact-row-detail';
    state.textContent =
      item.kind === 'outgoing'
        ? t('contacts.waiting')
        : t('contacts.saved-only');
    row.querySelector('.contact-row-body')?.append(state);
  }
  return row;
}
export function renderDirectory(view: DirectoryView): void {
  view.list.replaceChildren(
    ...view.items.map((item) => directoryRow(item, view)),
  );
  if (!view.items.length) emptyContacts(view.list, t('contacts.empty'));
}
