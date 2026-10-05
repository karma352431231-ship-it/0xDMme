export interface ConversationEntry {
  id: string;
  title: string;
  detail: string;
  kind: 'contact' | 'group';
  searchText: string;
  selected: boolean;
  open: () => void;
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
  avatar.textContent =
    entry.kind === 'group'
      ? '#'
      : entry.title.slice(0, 2).toLocaleUpperCase('pt-BR');
  const text = document.createElement('span');
  text.className = 'conversation-copy';
  const title = document.createElement('strong');
  title.textContent = entry.title;
  const detail = document.createElement('small');
  detail.textContent = entry.detail;
  text.append(title, detail);
  button.append(avatar, text);
  button.addEventListener('click', entry.open);
  return button;
}

export function renderDirectory(
  host: HTMLElement,
  entries: readonly ConversationEntry[],
): void {
  host.replaceChildren();
  for (const entry of entries) host.append(conversationButton(entry));
  if (entries.length) return;
  const empty = document.createElement('p');
  empty.className = 'directory-empty';
  empty.textContent =
    'Suas conversas aparecem aqui depois de adicionar um contato ou entrar em um grupo.';
  host.append(empty);
}
