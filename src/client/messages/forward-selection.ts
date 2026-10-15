import { t } from '../../shared/i18n/index.ts';
import { chooseForwardContact } from '../message-forward/index.ts';
import type { ForwardDirectory } from '../message-forward/index.ts';
import type { DailyRow, DailyView } from '../daily-text/index.ts';
interface ForwardOptions<T extends DailyRow> {
  history: () => HTMLElement | null;
  views: () => readonly DailyView<T>[];
  signal: () => AbortSignal;
  directory: ForwardDirectory;
  run: (work: () => Promise<void>) => Promise<void>;
  stage: (view: DailyView<T>, peer: string) => Promise<void>;
  flush: () => Promise<void>;
}
/** Selection belongs to the verified window. A gate closure cancels all remaining work. */
export class MessageForwardSelection<T extends DailyRow> {
  private readonly options: ForwardOptions<T>;
  private readonly selected = new Map<
    string,
    { hash: string; prepared?: string }
  >();
  private bar: HTMLElement | null = null;
  private count: HTMLElement | null = null;
  private send: HTMLButtonElement | null = null;
  private epoch = 0;
  private busy = false;
  private lifetime: AbortController | null = null;
  constructor(options: ForwardOptions<T>) {
    this.options = options;
  }
  start(view: DailyView<T>): void {
    if (this.busy || this.options.signal().aborted) return;
    if (!this.bar) this.mount();
    if (!this.bar) return;
    this.selected.set(view.id, { hash: view.hash });
    this.update();
  }
  clear(): void {
    this.epoch++;
    this.lifetime?.abort();
    this.lifetime = null;
    this.selected.clear();
    this.bar?.remove();
    this.bar = null;
    this.count = null;
    this.send = null;
    const history = this.options.history();
    if (history) {
      delete history.dataset['selecting'];
      for (const box of history.querySelectorAll('.forward-select'))
        box.remove();
    }
  }
  update(): void {
    if (!this.bar) return;
    const views = this.options.views();
    for (const [id, held] of this.selected)
      if (!views.some((view) => view.id === id && view.hash === held.hash))
        this.selected.delete(id);
    const history = this.options.history();
    for (const row of history?.querySelectorAll<HTMLElement>(
      '[data-message]',
    ) ?? [])
      this.checkbox(row);
    if (this.count)
      this.count.textContent = t('forward.selected {0}', [this.selected.size]);
    if (this.send) this.send.disabled = this.busy || this.selected.size === 0;
  }
  private mount(): void {
    const history = this.options.history();
    if (!history?.parentNode) return;
    this.lifetime = new AbortController();
    this.options.signal().addEventListener('abort', () => this.clear(), {
      once: true,
      signal: this.lifetime.signal,
    });
    this.bar = document.createElement('div');
    this.bar.className = 'forward-selection';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = t('Cancelar');
    cancel.addEventListener('click', () => {
      if (!this.busy) this.clear();
    });
    this.count = document.createElement('span');
    this.count.setAttribute('role', 'status');
    this.send = document.createElement('button');
    this.send.type = 'button';
    this.send.textContent = t('Encaminhar');
    this.send.addEventListener('click', () => {
      void this.choose();
    });
    this.bar.append(cancel, this.count, this.send);
    history.parentNode.insertBefore(this.bar, history);
    history.dataset['selecting'] = 'true';
  }
  private checkbox(row: HTMLElement): void {
    const id = row.dataset['message'] ?? '';
    let box = row.querySelector<HTMLInputElement>('.forward-select');
    if (!box) {
      box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'forward-select';
      box.setAttribute('aria-label', t('forward.select-message'));
      box.addEventListener('change', () => this.toggle(id, box!.checked));
      row.prepend(box);
    }
    box.checked = this.selected.has(id);
    box.disabled = this.busy;
  }
  private toggle(id: string, checked: boolean): void {
    if (this.busy) return;
    const view = this.options.views().find((item) => item.id === id);
    if (checked && view) this.selected.set(id, { hash: view.hash });
    else this.selected.delete(id);
    this.update();
  }
  private async choose(): Promise<void> {
    if (this.busy || !this.selected.size || !this.lifetime) return;
    const epoch = this.epoch;
    this.busy = true;
    this.update();
    try {
      const peer = await chooseForwardContact(
        this.options.directory,
        this.lifetime.signal,
      );
      if (peer && epoch === this.epoch)
        await this.options.run(() => this.deliver(peer, epoch));
    } catch (error: unknown) {
      await this.options.run(() =>
        Promise.reject(
          error instanceof Error
            ? error
            : new Error(t('forward.contacts-unavailable')),
        ),
      );
    } finally {
      this.busy = false;
      this.update();
    }
  }
  private current(epoch: number): boolean {
    return epoch === this.epoch && !this.options.signal().aborted;
  }
  private async forwardOne(
    view: DailyView<T>,
    peer: string,
    epoch: number,
  ): Promise<void> {
    const held = this.selected.get(view.id);
    if (!held || !this.current(epoch)) return;
    if (held.prepared && held.prepared !== peer)
      throw new Error('forward.pending-target');
    if (!held.prepared) {
      await this.options.stage(view, peer);
      held.prepared = peer;
    }
    if (!this.current(epoch)) return;
    await this.options.flush();
    this.selected.delete(view.id);
    this.update();
  }
  private async deliver(peer: string, epoch: number): Promise<void> {
    for (const view of this.options.views()) {
      if (!this.current(epoch)) return;
      await this.forwardOne(view, peer, epoch);
    }
    if (this.current(epoch) && !this.selected.size) this.clear();
  }
}
