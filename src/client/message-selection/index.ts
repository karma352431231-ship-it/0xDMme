import { t } from '../../shared/i18n/index.ts';
import { closeMessageMenu } from '../message-menu/index.ts';
import type { MessageRemovalResult } from '../message-removal-batch/index.ts';
interface SelectableMessage<T extends { id: string }> {
  message: T;
  row: HTMLElement;
}
/** One displayed conversation's explicit author-deletion selection. It never grants deletion authority. */
export class MessageDeletionSelection<T extends { id: string }> {
  private history: HTMLElement | null = null;
  private rows: readonly SelectableMessage<T>[] = [];
  private selected = new Set<string>();
  private toolbar: HTMLElement | null = null;
  private active = false;
  private busy = false;
  private readonly run: (work: () => Promise<void>) => Promise<void>;
  private lifetime = new AbortController();
  private generation = 0;
  private readonly options: {
    group?: boolean;
    remove: (
      messages: readonly T[],
    ) => Promise<readonly MessageRemovalResult[]>;
  };
  constructor(
    run: (work: () => Promise<void>) => Promise<void>,
    options: MessageDeletionSelection<T>['options'],
  ) {
    this.options = options;
    this.run = run;
  }
  update(history: HTMLElement, rows: readonly SelectableMessage<T>[]): void {
    if (this.history && this.history !== history) this.clear();
    if (this.history !== history) this.bind(history);
    this.history = history;
    this.rows = rows;
    const valid = new Set(rows.map((row) => row.message.id));
    if (!this.busy)
      this.selected = new Set([...this.selected].filter((id) => valid.has(id)));
    this.render();
  }
  begin(id: string): void {
    if (!this.rows.some((row) => row.message.id === id)) return;
    if (!this.selected.has(id) && this.selected.size >= 64) return;
    if (this.busy) return;
    closeMessageMenu(this.history);
    this.active = true;
    this.selected.add(id);
    this.render();
  }
  clear(): void {
    this.generation++;
    this.lifetime.abort();
    this.lifetime = new AbortController();
    this.busy = false;
    this.active = false;
    this.selected.clear();
    this.toolbar?.remove();
    this.toolbar = null;
    if (this.history) {
      delete this.history.dataset['selectingMessages'];
      this.history
        .querySelectorAll('.message-select')
        .forEach((node) => node.remove());
    }
    this.rows = [];
    this.history = null;
  }
  /** Capture before bubble gestures and embedded media/link actions. Native
   * vertical scrolling remains available; selection owns activation only. */
  private bind(history: HTMLElement): void {
    const listen = { capture: true, signal: this.lifetime.signal };
    history.addEventListener(
      'pointerdown',
      (event) => {
        if (this.active) event.stopImmediatePropagation();
      },
      listen,
    );
    for (const type of ['click', 'dblclick', 'contextmenu'])
      history.addEventListener(
        type,
        (event) => {
          if (!this.active) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          if (type !== 'click' || this.busy) return;
          const target = event.target as Node | null;
          const message = this.rows.find((message) =>
            target ? message.row.contains(target) : false,
          );
          if (message) this.toggle(message.message.id);
        },
        listen,
      );
  }
  private toggle(id: string): void {
    if (this.selected.has(id)) this.selected.delete(id);
    else if (this.selected.size < 64) this.selected.add(id);
    this.render();
  }
  private render(): void {
    const history = this.history;
    if (!history) return;
    history.dataset['selectingMessages'] = String(this.active);
    history
      .querySelectorAll('.message-select')
      .forEach((node) => node.remove());
    this.toolbar?.remove();
    this.toolbar = null;
    if (!this.active) return;
    this.renderToolbar(history);
    for (const message of this.rows) this.renderChoice(message);
  }
  private renderChoice(message: SelectableMessage<T>): void {
    const choice = document.createElement('input');
    choice.type = 'checkbox';
    choice.className = 'message-select';
    choice.checked = this.selected.has(message.message.id);
    choice.disabled =
      this.busy || (!choice.checked && this.selected.size >= 64);
    choice.setAttribute('aria-label', t('Select message for deletion'));
    choice.addEventListener('change', () => {
      if (
        this.busy ||
        (choice.checked &&
          this.selected.size >= 64 &&
          !this.selected.has(message.message.id))
      )
        return;
      if (choice.checked) this.selected.add(message.message.id);
      else this.selected.delete(message.message.id);
      this.render();
    });
    message.row.prepend(choice);
  }
  private renderToolbar(history: HTMLElement): void {
    const toolbar = document.createElement('div');
    toolbar.className = 'message-selection-toolbar';
    const remove = document.createElement('button'),
      cancel = document.createElement('button');
    remove.type = cancel.type = 'button';
    remove.textContent = this.options.group
      ? t('Delete for everyone') + ' (' + this.selected.size + ')'
      : t('Delete for both ({0})', [this.selected.size]);
    cancel.textContent = t('Cancel');
    remove.disabled = !this.selected.size || this.busy;
    cancel.disabled = this.busy;
    remove.addEventListener(
      'click',
      () => void this.run(() => this.removeSelected()),
    );
    cancel.addEventListener('click', () => {
      this.active = false;
      this.selected.clear();
      this.render();
    });
    toolbar.append(cancel, remove);
    history.before(toolbar);
    this.toolbar = toolbar;
  }
  private async removeSelected(): Promise<void> {
    if (this.busy) return;
    const targets = this.rows
      .filter((row) => this.selected.has(row.message.id))
      .map((row) => row.message);
    if (!targets.length) return;
    const generation = this.generation;
    this.busy = true;
    this.render();
    try {
      const results = await this.options.remove(targets);
      if (generation !== this.generation) return;
      for (const result of results)
        if (result.status === 'fulfilled') this.selected.delete(result.id);
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        const valid = new Set(this.rows.map((row) => row.message.id));
        this.selected = new Set(
          [...this.selected].filter((id) => valid.has(id)),
        );
        this.active = this.selected.size > 0;
        this.render();
      }
    }
  }
}
