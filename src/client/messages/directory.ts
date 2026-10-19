import { t, currentLanguage } from '../../shared/i18n/index.ts';
import { pingNotice } from '../ping/index.ts';
import type { PingMood } from '../ping/index.ts';
import { releaseConversationAvatars } from './directory-avatars.ts';
import { ConversationRow } from './directory-row.ts';
import type {
  ConversationEntry,
  ConversationFilter,
  DirectoryMenu,
} from './directory-types.ts';
export type {
  ConversationEntry,
  ConversationFilter,
  ConversationAction,
  DirectoryMenu,
} from './directory-types.ts';
export { renderStatusStrip } from './directory-status.ts';

export function filteredConversations(
  entries: readonly ConversationEntry[],
  filter: ConversationFilter,
): ConversationEntry[] {
  return entries
    .filter((entry) => {
      if (entry.hidden || !!entry.archived !== (filter === 'archived'))
        return false;
      if (filter === 'unread') return (entry.unread ?? 0) > 0;
      if (filter === 'favorites') return !!entry.favorite;
      return filter !== 'groups' || entry.kind === 'group';
    })
    .sort(
      (a, b) =>
        Number(!!b.pinned) - Number(!!a.pinned) ||
        (b.preview?.sequence ?? 0) - (a.preview?.sequence ?? 0),
    );
}
export function matchingConversations(
  entries: readonly ConversationEntry[],
  query: string,
): readonly ConversationEntry[] {
  const term = query
    .normalize('NFKC')
    .toLocaleLowerCase(currentLanguage())
    .trim();
  return entries.filter((entry) =>
    entry.searchText
      .normalize('NFKC')
      .toLocaleLowerCase(currentLanguage())
      .includes(term),
  );
}
export function conversationButton(
  entry: ConversationEntry,
): HTMLButtonElement {
  const row = new ConversationRow(entry);
  row.update(entry);
  return row.button;
}

interface DirectoryState {
  rows: Map<string, ConversationRow>;
  empty: HTMLElement | null;
  emptyProjection: string;
}
const directories = new WeakMap<HTMLElement, DirectoryState>();

export function clearDirectory(host: HTMLElement): void {
  releaseConversationAvatars(host);
  directories.delete(host);
  host.replaceChildren();
}
function directoryState(host: HTMLElement): DirectoryState {
  let state = directories.get(host);
  if (state) return state;
  clearDirectory(host);
  state = { rows: new Map(), empty: null, emptyProjection: '' };
  directories.set(host, state);
  return state;
}
interface DirectoryOptions {
  menu?: DirectoryMenu;
  empty?: string;
  emptyMood?: PingMood;
}
function updateEmpty(
  host: HTMLElement,
  state: DirectoryState,
  options: DirectoryOptions,
): void {
  const text =
    options.empty ??
    t(
      'Suas conversas aparecem aqui depois de adicionar um contato ou entrar em um grupo.',
    );
  const projection = JSON.stringify([text, options.emptyMood]);
  if (state.empty && state.emptyProjection === projection) return;
  state.empty?.remove();
  state.empty = options.emptyMood
    ? pingNotice(options.emptyMood, text, 'directory-empty')
    : document.createElement('p');
  if (!options.emptyMood) {
    state.empty.className = 'directory-empty';
    state.empty.textContent = text;
  }
  state.emptyProjection = projection;
  host.append(state.empty);
}
function entryKey(entry: ConversationEntry): string {
  return `${entry.kind}:${entry.id}`;
}
function removeMissing(
  state: DirectoryState,
  entries: readonly ConversationEntry[],
): void {
  const present = new Set(entries.map(entryKey));
  for (const [key, row] of state.rows)
    if (!present.has(key)) {
      row.dispose();
      state.rows.delete(key);
    }
}
export function renderDirectory(
  host: HTMLElement,
  entries: readonly ConversationEntry[],
  options: DirectoryOptions = {},
): void {
  const state = directoryState(host);
  options.menu?.update(entries);
  removeMissing(state, entries);
  if (!entries.length) return updateEmpty(host, state, options);
  state.empty?.remove();
  state.empty = null;
  const focused = document.activeElement as HTMLElement | null;
  const ownedFocus = focused && host.contains(focused);
  entries.forEach((entry, index) => {
    const key = entryKey(entry),
      row = state.rows.get(key) ?? new ConversationRow(entry);
    state.rows.set(key, row);
    row.update(entry, options.menu);
    const before = host.children[index];
    if (before === row.element) return;
    if (before) host.insertBefore(row.element, before);
    else host.append(row.element);
  });
  if (ownedFocus && focused.isConnected && document.activeElement !== focused)
    focused.focus({ preventScroll: true });
}

/** Contacts whose status is active, newest list order; the row only links to Status. */
export function statusAuthors(
  entries: readonly ConversationEntry[],
): ConversationEntry[] {
  return entries.filter(
    (entry) => entry.kind === 'contact' && entry.status && !entry.hidden,
  );
}
