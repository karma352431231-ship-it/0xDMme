import { t } from '../../shared/i18n/index.ts';
import type { ConversationAction, ConversationEntry } from './directory.ts';
import { withMenuIcon } from '../menu-icons/index.ts';

function actionSignature(
  actions: readonly ConversationAction[] = [],
): unknown[] {
  return actions.map((action) => [
    action.id,
    action.label,
    action.icon,
    actionSignature(action.choices),
  ]);
}

export function keepConversationMenu(
  current: ConversationEntry,
  entries: readonly ConversationEntry[],
): boolean {
  const next = entries.find(
    (entry) =>
      entry.id === current.id && entry.kind === current.kind && !entry.hidden,
  );
  if (
    !next ||
    next.title !== current.title ||
    next.menuNote !== current.menuNote
  )
    return false;
  const signature = (entry: ConversationEntry) =>
    JSON.stringify(actionSignature(entry.actions));
  return signature(current) === signature(next);
}

/** A scroll or canceled pointer never becomes a context-menu gesture. */
export class HoldGesture {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private origin = { x: 0, y: 0 };
  private held = false;
  private readonly open: () => void;
  constructor(open: () => void) {
    this.open = open;
  }
  start(x: number, y: number): void {
    this.cancel();
    this.held = false;
    this.origin = { x, y };
    this.timer = setTimeout(() => {
      this.timer = null;
      this.held = true;
      this.open();
    }, 500);
  }
  move(x: number, y: number): void {
    if (Math.hypot(x - this.origin.x, y - this.origin.y) > 10) this.cancel();
  }
  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  consumeClick(): boolean {
    const held = this.held;
    this.held = false;
    return held;
  }
}

export class ConversationMenu {
  private dialog: HTMLDialogElement | null = null;
  private bindings: (() => void)[] = [];
  private active: ConversationEntry | null = null;
  private busy = false;
  setBusy(busy: boolean): void {
    this.busy = busy;
    this.dialog
      ?.querySelectorAll<HTMLButtonElement>('[data-conversation-action]')
      .forEach((button) => {
        button.disabled = busy;
      });
  }
  close(): void {
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
    this.active = null;
  }
  update(entries: readonly ConversationEntry[]): void {
    if (this.active && !keepConversationMenu(this.active, entries))
      this.close();
    const active = this.active;
    if (active)
      this.active =
        entries.find(
          (entry) => entry.id === active.id && entry.kind === active.kind,
        ) ?? null;
    this.disposeRows();
  }
  reset(): void {
    this.close();
    this.disposeRows();
  }
  private disposeRows(): void {
    for (const dispose of this.bindings.splice(0)) dispose();
  }
  bind(
    row: HTMLElement,
    entry: ConversationEntry,
    trigger: HTMLButtonElement,
  ): void {
    const events = new AbortController();
    const hold = new HoldGesture(() => {
      if (row.isConnected) this.open(entry, trigger);
    });
    const options = { signal: events.signal };
    trigger.addEventListener('click', () => this.open(entry, trigger), options);
    row.addEventListener(
      'pointerdown',
      (event) => {
        if (event.pointerType === 'touch' && event.isPrimary)
          hold.start(event.clientX, event.clientY);
      },
      options,
    );
    row.addEventListener(
      'pointermove',
      (event) => hold.move(event.clientX, event.clientY),
      options,
    );
    for (const event of ['pointerup', 'pointercancel', 'pointerleave'])
      row.addEventListener(event, () => hold.cancel(), options);
    row.addEventListener(
      'click',
      (event) => {
        if (!hold.consumeClick()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { ...options, capture: true },
    );
    row.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key !== 'ContextMenu' &&
          !(event.shiftKey && event.key === 'F10')
        )
          return;
        event.preventDefault();
        this.open(entry, trigger);
      },
      options,
    );
    row.addEventListener(
      'contextmenu',
      (event) => {
        event.preventDefault();
        this.open(entry, trigger);
      },
      options,
    );
    this.bindings.push(() => {
      hold.cancel();
      events.abort();
    });
  }
  /** Actions with choices swap the list for those choices and a way back. */
  private renderActions(list: HTMLElement, path: readonly string[] = []): void {
    const actions = this.actionList(path);
    list.replaceChildren();
    if (path.length) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'menu-back';
      back.textContent = t('Voltar');
      withMenuIcon(back, 'back');
      back.addEventListener('click', () => {
        this.renderActions(list, path.slice(0, -1));
      });
      list.append(back);
    }
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      if (action.icon) withMenuIcon(button, action.icon);
      button.dataset['conversationAction'] = action.id;
      button.disabled = this.busy;
      button.addEventListener('click', () => {
        const current = this.actionList(path).find(
          (value) => value.id === action.id,
        );
        if (!current || this.busy) return;
        if (current.choices) {
          this.renderActions(list, [...path, current.id]);
          list.querySelector<HTMLButtonElement>('button')?.focus();
          return;
        }
        this.close();
        current.perform();
      });
      list.append(button);
    }
  }
  private actionList(path: readonly string[]): readonly ConversationAction[] {
    return path.reduce<readonly ConversationAction[]>(
      (actions, id) =>
        actions.find((action) => action.id === id)?.choices ?? [],
      this.active?.actions ?? [],
    );
  }
  private open(entry: ConversationEntry, anchor: HTMLElement): void {
    if (this.busy || !entry.actions?.length) return;
    this.close();
    this.active = entry;
    const dialog = document.createElement('dialog');
    this.dialog = dialog;
    dialog.className = 'conversation-menu';
    dialog.setAttribute('aria-label', t('Opções de {0}', [entry.title]));
    const title = document.createElement('strong');
    title.textContent = entry.title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'menu-close';
    close.textContent = t('Fechar');
    withMenuIcon(close, 'close');
    close.addEventListener('click', () => this.close());
    const list = document.createElement('div');
    list.className = 'conversation-menu-actions';
    dialog.append(title, close, list);
    this.renderActions(list);
    if (entry.menuNote) {
      const note = document.createElement('small');
      note.textContent = entry.menuNote;
      dialog.append(note);
    }
    const opened = performance.now();
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog && performance.now() - opened > 400) {
        const rect = dialog.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          this.close();
      }
    });
    dialog.addEventListener('cancel', () => this.close());
    document.body.append(dialog);
    dialog.showModal();
    const rect = anchor.getBoundingClientRect();
    dialog.style.setProperty(
      '--menu-left',
      `${Math.max(12, Math.min(window.innerWidth - dialog.offsetWidth - 12, rect.right - dialog.offsetWidth))}px`,
    );
    dialog.style.setProperty(
      '--menu-top',
      `${Math.max(12, Math.min(window.innerHeight - dialog.offsetHeight - 12, rect.bottom))}px`,
    );
  }
}
