import { conversationButton, matchingConversations } from './directory.ts';
import type { ConversationEntry } from './directory.ts';
export interface SearchPage {
  items: { id: string; peer: string; sequence: number; excerpt: string }[];
  next: string | null;
}
export class ConversationSearch {
  private readonly dialog = document.createElement('dialog');
  private entries: readonly ConversationEntry[] = [];
  private generation = 0;
  private next: string | null = null;
  private query = '';
  private busy = false;
  private readonly search: (
    query: string,
    after: string | null,
  ) => Promise<SearchPage>;
  constructor(
    search: (query: string, after: string | null) => Promise<SearchPage>,
  ) {
    this.search = search;
    this.dialog.className = 'conversation-search';
    this.dialog.setAttribute('aria-labelledby', 'conversation-search-title');
    this.dialog.innerHTML = `<div class="search-heading"><h2 id="conversation-search-title">Pesquisar</h2><button type="button" data-search-close aria-label="Fechar pesquisa">×</button></div><form><label for="conversation-query">Chats, contatos ou palavras nas mensagens</label><div class="search-input-row"><input id="conversation-query" type="search" maxlength="128" autocomplete="off" spellcheck="false"><button type="submit">Buscar mensagens</button></div></form><p class="search-scope">Busca local nos chats carregados e nas mensagens sincronizadas ou importadas neste aparelho.</p><h3>Chats e contatos</h3><div data-search-chats class="chat-contacts"></div><h3>Mensagens</h3><p data-search-notice role="status">Digite para encontrar uma conversa ou busque palavras nas mensagens.</p><ul data-search-messages></ul><button type="button" data-search-next hidden>Continuar busca</button>`;
    document.body.append(this.dialog);
    this.node('[data-search-close]').addEventListener('click', () =>
      this.close(),
    );
    this.dialog.addEventListener('cancel', () => this.reset());
    this.dialog.addEventListener('close', () => this.reset());
    this.node<HTMLInputElement>('input').addEventListener('input', () => {
      this.generation++;
      this.clearResults();
      this.renderChats();
    });
    this.node('form').addEventListener('submit', (event) => {
      event.preventDefault();
      void this.find(false);
    });
    this.node('[data-search-next]').addEventListener('click', () => {
      void this.find(true);
    });
  }
  private node<T extends HTMLElement>(selector: string): T {
    const node = this.dialog.querySelector<T>(selector);
    if (!node) throw new Error('Pesquisa incompleta.');
    return node;
  }
  update(entries: readonly ConversationEntry[]): void {
    this.entries = entries;
    if (this.dialog.open) this.renderChats();
  }
  open(): void {
    this.renderChats();
    this.dialog.showModal();
    this.node<HTMLInputElement>('input').focus();
  }
  close(): void {
    this.dialog.close();
    this.reset();
  }
  reset(): void {
    this.generation++;
    this.node<HTMLInputElement>('input').value = '';
    this.node('[data-search-chats]').replaceChildren();
    this.clearResults();
  }
  private clearResults(): void {
    this.next = null;
    this.query = '';
    this.node('[data-search-messages]').replaceChildren();
    this.node('[data-search-next]').hidden = true;
    this.node('[data-search-notice]').textContent =
      'Digite para encontrar uma conversa ou busque palavras nas mensagens.';
  }
  private renderChats(): void {
    const query = this.node<HTMLInputElement>('input').value;
    const host = this.node('[data-search-chats]');
    host.replaceChildren();
    const matches = matchingConversations(this.entries, query);
    for (const entry of matches.slice(0, 50))
      host.append(
        conversationButton({
          ...entry,
          open: () => {
            this.close();
            entry.open();
          },
        }),
      );
    if (!matches.length)
      host.textContent = 'Nenhuma conversa carregada corresponde à busca.';
  }
  private async find(more: boolean): Promise<void> {
    if (this.busy) return;
    const query = this.node<HTMLInputElement>('input').value.trim();
    if (!query) return;
    if (!more || query !== this.query) this.clearResults();
    this.query = query;
    const generation = this.generation;
    this.busy = true;
    this.node<HTMLButtonElement>('button[type="submit"]').disabled = true;
    this.node('[data-search-next]').hidden = true;
    this.node('[data-search-notice]').textContent = 'Buscando neste aparelho…';
    try {
      const page = await this.search(query, this.next);
      if (generation !== this.generation || !this.dialog.open) return;
      this.next = page.next;
      this.renderMessages(page);
      this.node('[data-search-next]').hidden = page.next === null;
      this.node('[data-search-notice]').textContent =
        page.next === null
          ? 'Busca concluída nas cópias disponíveis neste aparelho.'
          : 'Há mais histórico para consultar. Continue a busca.';
    } catch (error: unknown) {
      this.failed(error, generation);
    } finally {
      this.busy = false;
      this.node<HTMLButtonElement>('button[type="submit"]').disabled = false;
    }
  }
  private failed(error: unknown, generation: number): void {
    if (generation !== this.generation) return;
    this.node('[data-search-notice]').textContent =
      error instanceof Error ? error.message : 'Não foi possível pesquisar.';
  }
  private renderMessages(page: SearchPage): void {
    const host = this.node('[data-search-messages]');
    for (const item of page.items) {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent =
        this.entries.find((entry) => entry.id === item.peer)?.title ??
        'Conversa do histórico local';
      const text = document.createElement('p');
      text.textContent = item.excerpt;
      row.append(title, text);
      this.appendOpen(row, item.peer);
      host.append(row);
    }
    if (!host.children.length && page.next === null)
      host.textContent = 'Nenhuma mensagem encontrada.';
  }
  private appendOpen(row: HTMLElement, peer: string): void {
    const entry = this.entries.find((entry) => entry.id === peer);
    if (!entry) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Abrir conversa';
    button.addEventListener('click', () => {
      this.close();
      entry.open();
    });
    row.append(button);
  }
}
