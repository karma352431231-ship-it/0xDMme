import { displayName, paintAvatar } from '../appearance/index.ts';
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
  /** Shows the status ring; the row still opens the conversation. */
  status?: boolean;
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
  if (entry.status) {
    avatar.classList.add('has-status');
    avatar.title = 'Status ativo';
  }
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

/** Contacts whose status is active, newest list order; the row only links to Status. */
export function statusAuthors(
  entries: readonly ConversationEntry[],
): ConversationEntry[] {
  return entries.filter(
    (entry) => entry.kind === 'contact' && entry.status && !entry.hidden,
  );
}

/** "Seu status" plus each contact with an active status, as in the mockup. */
export function renderStatusStrip(
  host: HTMLElement,
  input: {
    /** Own account id while its status is active; null shows "publish". */
    ownActive: string | null;
    authors: readonly ConversationEntry[];
  },
): void {
  const own = statusTile(
    input.ownActive
      ? `#status?autor=${encodeURIComponent(input.ownActive)}`
      : '#status',
    'Seu status',
    null,
  );
  own
    .querySelector('.status-ring')
    ?.classList.toggle('active', !!input.ownActive);
  host.replaceChildren(
    own,
    ...input.authors.map((entry) =>
      statusTile(
        `#status?autor=${encodeURIComponent(entry.id)}`,
        displayName(entry.title),
        { label: entry.title, seed: entry.seed ?? entry.id },
      ),
    ),
  );
}

function statusTile(
  href: string,
  label: string,
  avatar: { label: string; seed: string } | null,
): HTMLAnchorElement {
  const tile = document.createElement('a');
  tile.className = 'status-tile';
  tile.href = href;
  const ring = document.createElement('span');
  ring.className = avatar ? 'status-ring active' : 'status-ring own';
  ring.setAttribute('aria-hidden', 'true');
  const face = document.createElement('span');
  face.className = 'conversation-avatar';
  if (avatar) paintAvatar(face, avatar);
  else face.textContent = '+';
  ring.append(face);
  const name = document.createElement('span');
  name.className = 'status-tile-name';
  name.textContent = label;
  tile.append(ring, name);
  tile.setAttribute(
    'aria-label',
    avatar ? `Ver status de ${label}` : 'Seu status: publicar ou ver',
  );
  return tile;
}
