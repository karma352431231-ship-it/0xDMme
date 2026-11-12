import { t, translatedError } from '../../shared/i18n/index.ts';
import {
  conversationButton,
  matchingConversations,
  clearDirectory,
} from './directory.ts';
import type { ConversationEntry } from './directory.ts';
import { pingNotice } from '../ping/index.ts';
import {
  latestConversationMatches,
  conversationMatches,
} from './search-results.ts';
import { searchMessageRow } from './search-view.ts';
export type { SearchItem, SearchPage } from './search-types.ts';
import type { SearchItem, SearchPage } from './search-types.ts';
export class ConversationSearch {
  private readonly dialog = document.createElement('dialog');
  private entries: readonly ConversationEntry[] = [];
  private scope: 'private' | 'public' = 'private';
  private additional = new Map<string, ConversationEntry>();
  private generation = 0;
  private next: string | null = null;
  private results: SearchItem[] = [];
  private query = '';
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Set while the dialog closes to open a result, so its query and results stay. */
  private keepResults = false;
  /** Search limited to one conversation, opened from its contact or group info. */
  private only: { id: string; title: string } | null = null;
  private readonly allLabel: string;
  private readonly search: (
    query: string,
    after: string | null,
  ) => Promise<SearchPage>;
  private readonly publicSearch:
    ((query: string, after: string | null) => Promise<SearchPage>) | undefined;
  private readonly openResult: (
    item: SearchItem,
    entry: ConversationEntry,
  ) => void;
  constructor(
    search: (query: string, after: string | null) => Promise<SearchPage>,
    openResult: (item: SearchItem, entry: ConversationEntry) => void,
    publicSearch?: (query: string, after: string | null) => Promise<SearchPage>,
  ) {
    this.search = search;
    this.publicSearch = publicSearch;
    this.openResult = openResult;
    this.dialog.className = 'conversation-search';
    this.dialog.setAttribute('aria-labelledby', 'conversation-search-title');
    this.dialog.innerHTML = t('html.bc850aca5a52');
    document.body.append(this.dialog);
    this.allLabel = this.dialog.querySelector('label')?.textContent ?? '';
    this.node('[data-search-close]').addEventListener('click', () =>
      this.close(),
    );
    this.dialog.addEventListener('cancel', () => this.reset());
    this.dialog.addEventListener('close', () => {
      if (!this.dialog.open) this.reset();
    });
    this.node<HTMLInputElement>('input').addEventListener('input', () => {
      this.generation++;
      this.clearResults();
      this.renderChats();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.find(false), 200);
    });
    this.node('form').addEventListener('submit', (event) =>
      event.preventDefault(),
    );
    this.dialog.addEventListener('scroll', () => {
      if (this.next && this.nearEnd()) void this.find(true);
    });
  }
  /** The input's label names what is searched; it is text only. */
  private setLabel(text: string): void {
    const label = this.dialog.querySelector('label');
    if (label) label.textContent = text;
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
  open(scope: 'private' | 'public' = 'private'): void {
    if (scope !== this.scope || this.only) {
      this.close();
      this.scope = scope;
    }
    this.node('#conversation-search-title').textContent =
      scope === 'public'
        ? t('Search handle conversations')
        : t('Search private conversations');
    this.renderChats();
    this.dialog.showModal();
    this.node<HTMLInputElement>('input').focus();
  }
  /** Every match in one private conversation or group, newest first. */
  openConversation(conversation: { id: string; title: string }): void {
    if (this.only?.id !== conversation.id || this.scope !== 'private')
      this.close();
    this.scope = 'private';
    this.only = conversation;
    this.dialog.dataset['conversation'] = 'true';
    this.node('#conversation-search-title').textContent = t('Search in {0}', [
      conversation.title,
    ]);
    this.setLabel(t('Words in this conversation'));
    if (!this.results.length) this.clearResults();
    this.dialog.showModal();
    this.node<HTMLInputElement>('input').focus();
  }
  close(): void {
    this.keepResults = false;
    this.dialog.close();
    this.reset();
  }
  /** Closes the dialog but keeps the query and results for the next opening. */
  hide(): void {
    this.keepResults = this.dialog.open || this.keepResults;
    this.dialog.close();
  }
  reset(): void {
    this.generation++;
    clearTimeout(this.timer);
    if (this.keepResults) {
      this.keepResults = false;
      return;
    }
    this.additional.clear();
    this.only = null;
    delete this.dialog.dataset['conversation'];
    this.setLabel(this.allLabel);
    this.node<HTMLInputElement>('input').value = '';
    clearDirectory(this.node('[data-search-chats]'));
    this.clearResults();
  }
  private clearResults(): void {
    this.next = null;
    this.results = [];
    this.query = '';
    clearDirectory(this.node('[data-search-messages]'));
    this.node('[data-search-notice]').textContent = this.only
      ? t('Type to search for words in this conversation.')
      : t('Type to find a conversation or search for words in messages.');
  }
  private renderChats(): void {
    const query = this.node<HTMLInputElement>('input').value;
    const host = this.node('[data-search-chats]');
    clearDirectory(host);
    if (!query.trim() || this.only) return;
    const matches = matchingConversations(
      this.scope === 'private' ? this.entries : [...this.additional.values()],
      query,
    );
    for (const entry of matches.slice(0, 50))
      host.append(
        conversationButton({
          ...entry,
          open: () => {
            this.hide();
            entry.open();
          },
        }),
      );
    if (!matches.length)
      host.textContent = t('No loaded conversations match the search.');
  }
  private nearEnd(): boolean {
    return (
      this.dialog.scrollHeight -
        this.dialog.scrollTop -
        this.dialog.clientHeight <
      160
    );
  }
  private async find(more: boolean): Promise<void> {
    if (this.busy || !this.dialog.open) return;
    const query = this.node<HTMLInputElement>('input').value.trim();
    if (!query) return;
    if (!more || query !== this.query) this.clearResults();
    this.query = query;
    const generation = this.generation;
    this.busy = true;
    this.node('[data-search-notice]').textContent = t(
      'Searching on this device…',
    );
    try {
      await this.readPages(generation, query);
    } catch (error: unknown) {
      if (generation === this.generation) this.next = null;
      this.failed(error, generation);
    } finally {
      this.busy = false;
      this.continueSearch(generation);
    }
  }
  private async readPages(generation: number, query: string): Promise<void> {
    for (let page = 0; page < 12; page++) {
      const cursor = this.next;
      const result = await this.sourcePage(query, cursor);
      if (generation !== this.generation || !this.dialog.open) return;
      if (result.next !== null && result.next === cursor)
        throw new Error('Invalid search page.');
      this.next = result.next;
      this.acceptEntries(result);
      this.renderMessages(result);
      if (this.next === null) break;
    }
    this.node('[data-search-notice]').textContent =
      this.next === null
        ? t('Search completed in copies available on this device.')
        : t('More history is available. Scroll to continue searching.');
  }
  private sourcePage(
    query: string,
    cursor: string | null,
  ): Promise<SearchPage> {
    const source = this.scope === 'private' ? this.search : this.publicSearch;
    if (!source)
      return Promise.reject(new Error('Handle search is unavailable.'));
    return source(query, cursor);
  }
  private acceptEntries(result: SearchPage): void {
    if (this.scope !== 'public') return;
    for (const entry of result.entries ?? []) {
      this.additional.set(entry.id, entry);
      if (this.additional.size > 100)
        this.additional.delete(this.additional.keys().next().value!);
    }
    if (result.entries?.length) this.renderChats();
  }
  private continueSearch(generation: number): void {
    if (!this.dialog.open) return;
    if (generation !== this.generation) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.find(false), 200);
    } else if (this.next && this.nearEnd()) {
      this.timer = setTimeout(() => void this.find(true), 0);
    }
  }
  private failed(error: unknown, generation: number): void {
    if (generation !== this.generation) return;
    this.node('[data-search-notice]').textContent =
      error instanceof Error
        ? translatedError(error.message)
        : t('Could not search.');
  }
  /** Keep the latest matching message per conversation across all pages. */
  private renderMessages(page: SearchPage): void {
    const host = this.node('[data-search-messages]');
    this.results = this.only
      ? conversationMatches(this.only.id, [...this.results, ...page.items])
      : latestConversationMatches([...this.results, ...page.items]);
    clearDirectory(host);
    for (const item of this.results) {
      const entry =
        this.scope === 'private'
          ? this.entries.find((entry) => entry.id === item.peer)
          : this.additional.get(item.peer);
      const row = searchMessageRow({
        item,
        entry,
        query: this.query,
        open: () => {
          if (!entry) return;
          this.hide();
          this.openResult(item, entry);
        },
      });
      host.append(row);
    }
    if (!host.children.length && page.next === null)
      host.replaceChildren(
        pingNotice('puzzled', t('No messages found.'), 'search-empty'),
      );
  }
}
