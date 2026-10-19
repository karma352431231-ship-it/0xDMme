import { t } from '../../shared/i18n/index.ts';
import { anchoredMessageMenu } from '../message-menu/index.ts';
import { withMenuIcon } from '../menu-icons/index.ts';
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
  private editing: GroupView | null = null;
  private paused = false;
  constructor(actions: Actions) {
    this.actions = actions;
  }
  close(): void {
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
    this.editing = null;
    this.paused = false;
  }
  pause(): void {
    if (!this.dialog?.open) return;
    this.paused = true;
    this.dialog.close();
  }
  resume(views: readonly GroupView[]): void {
    if (!this.paused) return;
    const editing = this.editing;
    const current = views.find(
      (view) =>
        view.id === editing?.id &&
        view.groupId === editing.groupId &&
        view.hash === editing.hash &&
        view.own &&
        !view.localOnly,
    );
    if (!current) {
      this.close();
      return;
    }
    this.paused = false;
    this.dialog?.showModal();
  }
  render(view: GroupView, signal: AbortSignal): HTMLElement {
    if (!view.own || view.localOnly) return document.createElement('div');
    const { host, panel } = anchoredMessageMenu({ signal });
    if (view.kind === 'text')
      panel.append(
        withMenuIcon(
          this.button(t('Editar'), () => this.edit(view)),
          'edit',
        ),
      );
    panel.append(
      withMenuIcon(
        this.button(t('Apagar para todos'), () => {
          void this.actions.run(() => this.actions.remove(view));
        }),
        'trash',
      ),
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
    dialog.setAttribute('aria-label', t('Editar mensagem'));
    title.textContent = t('Editar mensagem');
    text.value = view.text;
    text.required = true;
    text.setAttribute('aria-label', t('Mensagem'));
    save.type = 'submit';
    save.textContent = t('Salvar alteração');
    form.append(
      title,
      text,
      save,
      this.button(t('Cancelar'), () => this.close()),
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
    this.editing = view;
    dialog.showModal();
    text.focus();
  }
}
