import { t } from '../../shared/i18n/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import type { SavedContact } from './directory.ts';
import { walletKey } from './agenda.ts';
import { contactRow, contactSearchMatches, emptyContacts } from './view.ts';
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
  openChat?: (peer: ListedPeer) => Promise<void>;
  button: (label: string, work: () => Promise<void>) => HTMLButtonElement;
  openContact: (item: DirectoryItem) => Promise<void>;
}
function directoryTitle(item: DirectoryItem): string {
  if (item.saved && item.saved.contact.alias) return item.saved.contact.alias;
  if (item.peer && item.peer.name) return item.peer.name;
  if (item.saved?.contact.addedVia === 'invite') return t('Sem nome');
  const identity = item.peer ?? item.saved!.contact;
  return shortAddress(identity.address);
}
function directoryRow(item: DirectoryItem, view: DirectoryView): HTMLLIElement {
  const title = directoryTitle(item);
  const identity = item.peer ?? item.saved!.contact;
  const { row, actions } = contactRow({
    title,
    seed: identity.address,
    detail:
      item.saved?.contact.addedVia === 'invite'
        ? t('Added via invitation')
        : shortAddress(identity.address),
  });
  if (item.kind === 'approved' && item.peer && view.openChat) {
    const peer = item.peer,
      open = view.openChat;
    const chat = view.button(t('Conversar'), () => open(peer));
    chat.className = 'primary';
    actions.append(chat);
  }
  actions.append(view.button(t('Abrir contato'), () => view.openContact(item)));
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
