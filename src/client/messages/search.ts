import { t, translatedError } from '../../shared/i18n/index.ts';
import {
  conversationButton,
  matchingConversations,
  clearDirectory,
} from './directory.ts';
import type { ConversationEntry } from './directory.ts';
import { pingNotice } from '../ping/index.ts';
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
    this.dialog.innerHTML = t('html.bc850aca5a52');
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
    if (!node) throw new Error('Search incomplete.');
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
    clearDirectory(this.node('[data-search-chats]'));
    this.clearResults();
  }
  private clearResults(): void {
    this.next = null;
    this.query = '';
    this.node('[data-search-messages]').replaceChildren();
    this.node('[data-search-next]').hidden = true;
    this.node('[data-search-notice]').textContent = t(
      'Type to find a conversation or search for words in messages.',
    );
  }
  private renderChats(): void {
    const query = this.node<HTMLInputElement>('input').value;
    const host = this.node('[data-search-chats]');
    clearDirectory(host);
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
      host.textContent = t('No loaded conversations match the search.');
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
    this.node('[data-search-notice]').textContent = t(
      'Searching on this device…',
    );
    try {
      const page = await this.search(query, this.next);
      if (generation !== this.generation || !this.dialog.open) return;
      this.next = page.next;
      this.renderMessages(page);
      this.node('[data-search-next]').hidden = page.next === null;
      this.node('[data-search-notice]').textContent =
        page.next === null
          ? t('Search completed in copies available on this device.')
          : t('More history is available. Continue searching.');
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
      error instanceof Error
        ? translatedError(error.message)
        : t('Could not search.');
  }
  private renderMessages(page: SearchPage): void {
    const host = this.node('[data-search-messages]');
    for (const item of page.items) {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent =
        this.entries.find((entry) => entry.id === item.peer)?.title ??
        t('Local history conversation');
      const text = document.createElement('p');
      text.textContent = item.excerpt;
      row.append(title, text);
      this.appendOpen(row, item.peer);
      host.append(row);
    }
    if (!host.children.length && page.next === null)
      host.replaceChildren(
        pingNotice('puzzled', t('No messages found.'), 'search-empty'),
      );
  }
  private appendOpen(row: HTMLElement, peer: string): void {
    const entry = this.entries.find((entry) => entry.id === peer);
    if (!entry) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t('Open conversation');
    button.addEventListener('click', () => {
      this.close();
      entry.open();
    });
    row.append(button);
  }
}
