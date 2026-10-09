import { displayName, paintAvatar } from '../identity-display/index.ts';
export interface DirectoryMenu {
  update: (entries: readonly ConversationEntry[]) => void;
  bind: (
    row: HTMLElement,
    entry: ConversationEntry,
    trigger: HTMLButtonElement,
  ) => void;
}
export type ConversationFilter =
  'all' | 'unread' | 'favorites' | 'groups' | 'archived';
export interface ConversationAction {
  id: string;
  label: string;
  perform: () => void;
}
export interface ConversationEntry {
  id: string;
  title: string;
  detail: string;
  kind: 'contact' | 'group';
  /** Wallet address for contacts, so the avatar tone matches Contatos; defaults to the id. */
  seed?: string;
  searchText: string;
  selected: boolean;
  open: () => void;
  archived?: boolean;
  pinned?: boolean;
  favorite?: boolean;
  unread?: number;
  hidden?: boolean;
  actions?: readonly ConversationAction[];
  menuNote?: string;
}
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
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
}

export function matchingConversations(
  entries: readonly ConversationEntry[],
  query: string,
): readonly ConversationEntry[] {
  const term = query.normalize('NFKC').toLocaleLowerCase('pt-BR').trim();
  return entries.filter((entry) =>
    entry.searchText
      .normalize('NFKC')
      .toLocaleLowerCase('pt-BR')
      .includes(term),
  );
}

export function conversationButton(
  entry: ConversationEntry,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'conversation-row';
  button.dataset['conversation'] = entry.id;
  button.setAttribute('aria-pressed', String(entry.selected));
  const avatar = document.createElement('span');
  avatar.className = `conversation-avatar ${entry.kind}`;
  avatar.setAttribute('aria-hidden', 'true');
  paintAvatar(avatar, { label: entry.title, seed: entry.seed ?? entry.id });
  const text = document.createElement('span');
  text.className = 'conversation-copy';
  const title = document.createElement('strong');
  title.textContent = displayName(entry.title);
  if (title.textContent !== entry.title) title.title = entry.title;
  const detail = document.createElement('small');
  detail.textContent = entry.detail;
  text.append(title, detail);
  button.append(avatar, text);
  if (entry.unread) {
    const unread = document.createElement('span');
    unread.className = 'conversation-unread';
    unread.textContent = entry.unread > 99 ? '99+' : String(entry.unread);
    unread.setAttribute('aria-label', `${entry.unread} mensagens não lidas`);
    button.append(unread);
  }
  button.addEventListener('click', entry.open);
  return button;
}

export function renderDirectory(
  host: HTMLElement,
  entries: readonly ConversationEntry[],
  options: { menu?: DirectoryMenu; empty?: string } = {},
): void {
  options.menu?.update(entries);
  host.replaceChildren();
  for (const entry of entries) {
    const button = conversationButton(entry);
    if (!entry.actions?.length || !options.menu) {
      host.append(button);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'conversation-item';
    button.setAttribute('aria-haspopup', 'dialog');
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'conversation-menu-trigger';
    trigger.textContent = '⌄';
    trigger.setAttribute('aria-label', `Opções de ${entry.title}`);
    trigger.setAttribute('aria-haspopup', 'dialog');
    row.append(button, trigger);
    options.menu.bind(row, entry, trigger);
    host.append(row);
  }
  if (entries.length) return;
  const empty = document.createElement('p');
  empty.className = 'directory-empty';
  empty.textContent =
    options.empty ??
    'Suas conversas aparecem aqui depois de adicionar um contato ou entrar em um grupo.';
  host.append(empty);
}
