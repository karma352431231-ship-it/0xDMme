import { t, translatedError } from '../../shared/i18n/index.ts';

interface Target<T> {
  message: T;
  text: string;
  row: HTMLElement;
}
interface Draft<T> {
  id: string;
  target: Target<T>;
  original: string;
  text: string;
  saving: boolean;
  conflict: boolean;
  error: string;
}
interface EditorUi {
  form: HTMLFormElement;
  input: HTMLTextAreaElement;
  status: HTMLElement;
  save: HTMLButtonElement;
  cancel: HTMLButtonElement;
}
/** Owns a single ephemeral edit and its DOM. Callers supply only currently
 * editable verified rows and the existing authenticated edit operation.
 * It never reads or changes the new-message composer or persists plaintext. */
export class InlineMessageEditor<T extends { id: string }> {
  private targets = new Map<string, Target<T>>();
  private draft: Draft<T> | null = null;
  private ui: EditorUi | null = null;
  private focused = false;
  private lifetime = new AbortController();
  private readonly options: {
    run: (work: () => Promise<void>) => Promise<void>;
    save: (message: T, text: string) => Promise<void>;
  };
  constructor(options: InlineMessageEditor<T>['options']) {
    this.options = options;
  }
  update(targets: readonly Target<T>[]): void {
    this.targets = new Map(
      targets.map((target) => [target.message.id, target]),
    );
    const draft = this.draft;
    if (!draft) return;
    const target = this.targets.get(draft.id);
    if (!target) return this.cancel();
    draft.conflict = target.text !== draft.original;
    draft.target.row.removeAttribute('data-editing-message');
    draft.target = target;
    this.mount();
    if (this.focused) this.ui?.input.focus({ preventScroll: true });
    this.sync();
  }
  begin(id: string): void {
    const target = this.targets.get(id);
    if (!target || this.draft?.saving) return;
    if (this.draft?.id === id) {
      this.ui?.input.focus({ preventScroll: true });
      return;
    }
    this.cancel();
    this.draft = {
      id,
      target,
      original: target.text,
      text: target.text,
      saving: false,
      conflict: false,
      error: '',
    };
    this.ui = this.create();
    this.mount();
    this.sync();
    this.ui.input.focus({ preventScroll: true });
  }
  /** Starting another message action dismisses the edit without changing eligibility. */
  dismiss(): void {
    this.cancel();
  }
  /** Navigation, authority loss and a closed history gate discard the edit. */
  clear(): void {
    this.cancel();
    this.targets.clear();
  }
  private cancel(): void {
    this.draft?.target.row.removeAttribute('data-editing-message');
    this.lifetime.abort();
    this.lifetime = new AbortController();
    this.ui?.form.remove();
    this.ui = null;
    this.focused = false;
    this.draft = null;
  }
  private finish(): void {
    const row = this.draft?.target.row;
    this.cancel();
    row?.querySelector<HTMLButtonElement>('.message-actions > button')?.focus({
      preventScroll: true,
    });
  }
  private mount(): void {
    if (!this.draft || !this.ui) return;
    const row = this.draft.target.row;
    row.setAttribute('data-editing-message', 'true');
    if (this.ui.form.parentNode !== row) row.append(this.ui.form);
    this.resize();
  }
  private create(): EditorUi {
    const form = document.createElement('form'),
      label = document.createElement('label'),
      input = document.createElement('textarea'),
      details = document.createElement('details'),
      summary = document.createElement('summary'),
      original = document.createElement('p'),
      footer = document.createElement('div'),
      status = document.createElement('p'),
      cancel = document.createElement('button'),
      save = document.createElement('button');
    form.className = 'message-inline-editor';
    form.setAttribute('aria-label', t('Edit message'));
    label.textContent = t('Edit message');
    input.value = this.draft!.text;
    input.rows = 1;
    input.setAttribute('aria-label', t('Edit message'));
    summary.textContent = t('View original');
    original.textContent = this.draft!.original;
    details.append(summary, original);
    cancel.type = 'button';
    cancel.textContent = t('Cancel');
    save.type = 'submit';
    save.textContent = t('Save');
    status.setAttribute('role', 'status');
    footer.append(details, cancel, save);
    label.append(input);
    form.append(label, footer, status);
    const signal = this.lifetime.signal;
    if (typeof window !== 'undefined')
      window.addEventListener('resize', () => this.resize(), { signal });
    input.addEventListener(
      'focus',
      () => {
        this.focused = true;
      },
      { signal },
    );
    input.addEventListener(
      'blur',
      () => {
        if (input.isConnected) this.focused = false;
      },
      { signal },
    );
    cancel.addEventListener('click', () => this.finish(), { signal });
    input.addEventListener('input', () => this.change(), { signal });
    form.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void this.submit();
      },
      { signal },
    );
    form.addEventListener('keydown', (event) => this.key(event), { signal });
    return { form, input, status, save, cancel };
  }
  private change(): void {
    if (!this.draft || !this.ui) return;
    this.draft.text = this.ui.input.value;
    this.draft.error = '';
    this.resize();
    this.sync();
  }
  private resize(): void {
    if (!this.ui) return;
    this.ui.input.style.height = 'auto';
    this.ui.input.style.height = `${Math.min(240, Math.max(56, this.ui.input.scrollHeight))}px`;
  }
  private sync(): void {
    const draft = this.draft,
      ui = this.ui;
    if (!draft || !ui) return;
    ui.input.readOnly = draft.saving;
    ui.cancel.disabled = draft.saving;
    ui.save.disabled =
      draft.saving ||
      draft.conflict ||
      !draft.text.trim() ||
      draft.text === draft.original;
    ui.form.setAttribute('aria-busy', String(draft.saving));
    ui.save.textContent = draft.saving ? t('Saving…') : t('Save');
    ui.status.textContent =
      draft.conflict && !draft.saving
        ? t('This message changed. Cancel and reopen the editor to review it.')
        : draft.error;
    ui.status.hidden = !ui.status.textContent;
  }
  private key(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (event.key === 'Escape' && !this.draft?.saving) {
      event.preventDefault();
      event.stopPropagation();
      this.finish();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void this.submit();
    }
  }
  private async submit(): Promise<void> {
    const draft = this.draft;
    if (!draft || this.ui?.save.disabled) return;
    draft.saving = true;
    this.sync();
    try {
      await this.options.run(async () => {
        // A queued operation must not outlive navigation or authority loss.
        if (this.draft !== draft || draft.conflict) return;
        try {
          await this.options.save(draft.target.message, draft.text);
          if (this.draft === draft) this.finish();
        } catch (error: unknown) {
          draft.error = editError(error);
          throw error;
        }
      });
    } catch (error: unknown) {
      draft.error = editError(error);
    } finally {
      draft.saving = false;
      if (this.draft === draft) this.sync();
    }
  }
}
function editError(error: unknown): string {
  return error instanceof Error
    ? translatedError(error.message)
    : t('Could not complete the operation.');
}
