import { t } from '../../shared/i18n/index.ts';
interface SelectableMessage {
  id: string;
  row: HTMLElement;
  remove: () => Promise<void>;
}
/** One displayed conversation's explicit author-deletion selection. It never grants deletion authority. */
export class MessageDeletionSelection {
  private history: HTMLElement | null = null;
  private rows: readonly SelectableMessage[] = [];
  private selected = new Set<string>();
  private toolbar: HTMLElement | null = null;
  private active = false;
  private busy = false;
  private readonly run: (work: () => Promise<void>) => Promise<void>;
  constructor(run: (work: () => Promise<void>) => Promise<void>) {
    this.run = run;
  }
  update(history: HTMLElement, rows: readonly SelectableMessage[]): void {
    if (this.history && this.history !== history) this.clear();
    this.history = history;
    this.rows = rows;
    const valid = new Set(rows.map((row) => row.id));
    if (!this.busy)
      this.selected = new Set([...this.selected].filter((id) => valid.has(id)));
    this.render();
  }
  begin(id: string): void {
    if (!this.rows.some((row) => row.id === id)) return;
    if (!this.selected.has(id) && this.selected.size >= 64) return;
    this.active = true;
    this.selected.add(id);
    this.render();
  }
  clear(): void {
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
  private renderChoice(message: SelectableMessage): void {
    const choice = document.createElement('input');
    choice.type = 'checkbox';
    choice.className = 'message-select';
    choice.checked = this.selected.has(message.id);
    choice.disabled =
      this.busy || (!choice.checked && this.selected.size >= 64);
    choice.setAttribute('aria-label', t('Select message for deletion'));
    choice.addEventListener('change', () => {
      if (choice.checked) this.selected.add(message.id);
      else this.selected.delete(message.id);
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
    remove.textContent = t('Delete for both ({0})', [this.selected.size]);
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
    const targets = this.rows.filter((row) => this.selected.has(row.id));
    if (targets.length > 64)
      throw new Error('Select up to 64 messages at a time.');
    this.busy = true;
    this.render();
    try {
      for (const target of targets) {
        await target.remove();
        this.selected.delete(target.id);
      }
      this.active = this.selected.size > 0;
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
