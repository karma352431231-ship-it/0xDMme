import { t, translatedError } from '../../shared/i18n/index.ts';
import { chatIcon } from '../chat-ui/index.ts';
import { paintAvatar } from '../appearance/index.ts';
import { groupManager } from '../../shared/groups/index.ts';
import type { GroupPhoto } from '../../shared/group-messages/index.ts';
import type { GroupSummary } from './controller.ts';
import { prepareGroupPhoto, groupPhotoBlob } from './photo.ts';
interface PhotoOptions {
  selected: () => GroupSummary | null;
  account: () => string | undefined;
  load: () => Promise<GroupPhoto | null>;
  save: (input: {
    group: string;
    id: string;
    photo: GroupPhoto | null;
  }) => Promise<void>;
  run: (work: () => Promise<void>) => Promise<void>;
}
/** Owns preview bytes, admin eligibility and draft/async lifetime, outside startGroups. */
export class GroupPhotoUi {
  private readonly options: PhotoOptions;
  private dialog: HTMLDialogElement | null = null;
  private url: string | null = null;
  private busy = false;
  private epoch = 0;
  constructor(options: PhotoOptions) {
    this.options = options;
  }
  reset(): void {
    this.epoch++;
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
  open(): void {
    const group = this.options.selected(),
      account = this.options.account();
    if (
      !group ||
      group.localOnly ||
      !account ||
      !groupManager(group.state, account)
    )
      return;
    if (this.busy) return;
    this.reset();
    const dialog = document.createElement('dialog');
    this.dialog = dialog;
    dialog.className = 'group-dialog group-photo-dialog';
    dialog.setAttribute('aria-label', t('Foto do grupo'));
    dialog.innerHTML = t('html.b63f4d3d54aa', [chatIcon('close')]);
    const preview = dialog.querySelector<HTMLElement>('[data-preview]')!,
      file = dialog.querySelector<HTMLInputElement>('[data-file]')!,
      save = dialog.querySelector<HTMLButtonElement>('[data-save]')!;
    paintAvatar(preview, { label: group.title, seed: group.state.groupId });
    let photo: GroupPhoto | null = null,
      id = crypto.randomUUID(),
      dirty = false;
    const current = this.epoch;
    const changed = (value: GroupPhoto | null) => {
      photo = value;
      dirty = true;
      dialog.dataset['dirty'] = 'true';
      id = crypto.randomUUID();
      this.preview(preview, photo, group);
      save.disabled = false;
    };
    dialog
      .querySelector('[data-pick]')!
      .addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const chosen = file.files?.[0];
      file.value = '';
      if (!chosen) return;
      void this.perform(dialog, async () => {
        const prepared = await prepareGroupPhoto(chosen);
        if (current === this.epoch) changed(prepared);
      });
    });
    dialog
      .querySelector('[data-remove]')!
      .addEventListener('click', () => changed(null));
    save.addEventListener('click', () => {
      if (!dirty) return;
      void this.perform(dialog, async () => {
        let saved = false;
        let failure: Error | null = null;
        await this.options.run(async () => {
          try {
            await this.options.save({ group: group.state.groupId, id, photo });
            saved = true;
          } catch (error: unknown) {
            failure =
              error instanceof Error
                ? error
                : new Error('Foto não confirmada. Tente novamente.');
            throw error;
          }
        });
        if (!saved)
          throw failure ?? new Error('Foto não confirmada. Tente novamente.');
        if (current === this.epoch) this.reset();
      });
    });
    dialog.querySelector('[data-close]')!.addEventListener('click', () => {
      if (!this.busy) this.reset();
    });
    dialog.addEventListener('cancel', (event) => {
      if (this.busy) event.preventDefault();
    });
    dialog.addEventListener('close', () => {
      if (this.dialog === dialog) this.reset();
    });
    document.body.append(dialog);
    dialog.showModal();
    void this.perform(dialog, async () => {
      photo = await this.options.load();
      if (current === this.epoch) this.preview(preview, photo, group);
    });
  }
  private preview(
    node: HTMLElement,
    photo: GroupPhoto | null,
    group: GroupSummary,
  ): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    paintAvatar(node, { label: group.title, seed: group.state.groupId });
    if (!photo) return;
    this.url = URL.createObjectURL(groupPhotoBlob(photo));
    const image = document.createElement('img');
    image.src = this.url;
    image.alt = '';
    node.replaceChildren(image);
  }
  private async perform(
    dialog: HTMLDialogElement,
    work: () => Promise<void>,
  ): Promise<void> {
    if (this.busy || this.dialog !== dialog) return;
    this.busy = true;
    const controls = [...dialog.querySelectorAll<HTMLButtonElement>('button')],
      disabled = controls.map((node) => node.disabled);
    controls.forEach((node) => {
      node.disabled = true;
    });
    const feedback = dialog.querySelector('[data-feedback]')!;
    feedback.textContent = '';
    try {
      await work();
    } catch (error: unknown) {
      if (this.dialog === dialog)
        feedback.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('Foto não confirmada. Tente novamente.');
    } finally {
      this.busy = false;
      controls.forEach((node, index) => {
        node.disabled = disabled[index]!;
      });
      const save = dialog.querySelector<HTMLButtonElement>('[data-save]');
      if (save) save.disabled = dialog.dataset['dirty'] !== 'true';
    }
  }
}
/** One decoded avatar per selected profile revision, released on navigation/revocation. */
export class GroupPhotoView {
  private nodes: HTMLElement[] = [];
  private key = '';
  private epoch = 0;
  private url: string | null = null;
  reset(): void {
    this.epoch++;
    this.key = '';
    for (const node of this.nodes) node.querySelector('img')?.remove();
    this.nodes = [];
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
  show(
    key: string,
    nodes: HTMLElement[],
    load: () => Promise<GroupPhoto | null>,
  ): void {
    if (key === this.key) {
      this.paint(nodes);
      return;
    }
    this.reset();
    this.key = key;
    this.nodes = nodes;
    const epoch = this.epoch;
    void load()
      .then((photo) => {
        if (epoch !== this.epoch || !photo) return;
        this.url = URL.createObjectURL(groupPhotoBlob(photo));
        this.paint(nodes);
      })
      .catch(() => {
        if (epoch === this.epoch)
          nodes.forEach((node) => {
            node.title = t('Foto do grupo indisponível neste aparelho.');
          });
      });
  }
  private paint(nodes: HTMLElement[]): void {
    if (!this.url) return;
    for (const node of nodes) {
      const image = document.createElement('img');
      image.src = this.url;
      image.alt = '';
      node.replaceChildren(image);
    }
  }
}
