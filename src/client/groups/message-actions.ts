import { anchoredMessageMenu } from '../message-menu/index.ts';
import type { GroupView } from './reader.ts';
interface Actions {
  run: (work: () => Promise<void>) => Promise<void>;
  edit: (view: GroupView, text: string) => Promise<void>;
  remove: (view: GroupView) => Promise<void>;
}
/** Own-message capabilities and editing draft have a lifecycle independent of
 * unchanged message bubbles. Server authorization remains authoritative. */
export class GroupMessageActions {
  private readonly actions: Actions;
  private dialog: HTMLDialogElement | null = null;
  constructor(actions: Actions) {
    this.actions = actions;
  }
  close(): void {
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
  }
  render(view: GroupView, signal: AbortSignal): HTMLElement {
    if (!view.own || view.localOnly) return document.createElement('div');
    const { host, panel } = anchoredMessageMenu({ signal });
    if (view.kind === 'text')
      panel.append(this.button('Editar', () => this.edit(view)));
    panel.append(
      this.button('Apagar para todos', () => {
        void this.actions.run(() => this.actions.remove(view));
      }),
    );
    return host;
  }
  private button(label: string, work: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', work);
    return button;
  }
  private edit(view: GroupView): void {
    this.close();
    const dialog = document.createElement('dialog'),
      form = document.createElement('form'),
      title = document.createElement('h2'),
      text = document.createElement('textarea'),
      save = document.createElement('button');
    dialog.className = 'group-dialog group-message-edit';
    dialog.setAttribute('aria-label', 'Editar mensagem');
    title.textContent = 'Editar mensagem';
    text.value = view.text;
    text.required = true;
    text.setAttribute('aria-label', 'Mensagem');
    save.type = 'submit';
    save.textContent = 'Salvar alteração';
    form.append(
      title,
      text,
      save,
      this.button('Cancelar', () => this.close()),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = text.value;
      if (!value.trim()) return;
      save.disabled = true;
      void this.actions.run(async () => {
        try {
          await this.actions.edit(view, value);
          this.close();
        } finally {
          save.disabled = false;
        }
      });
    });
    dialog.append(form);
    document.body.append(dialog);
    this.dialog = dialog;
    dialog.showModal();
    text.focus();
  }
}
