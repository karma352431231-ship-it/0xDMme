import { t, translatedError } from '../../shared/i18n/index.ts';
import type { GroupPhoto } from '../../shared/group-messages/index.ts';
import { paintAvatar } from '../appearance/index.ts';
import { prepareGroupPhoto, groupPhotoBlob } from './photo.ts';

/** Creation-only drafts: prepared bytes stay local until the create submission. */
export class GroupCreationFields {
  private host: HTMLDialogElement | null = null;
  private photo: GroupPhoto | null = null;
  private url: string | null = null;
  private generation = 0;
  private preparation: Promise<void> = Promise.resolve();
  private failure: Error | null = null;
  reset(): void {
    this.generation++;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.photo = null;
    this.host = null;
    this.failure = null;
    this.preparation = Promise.resolve();
  }
  mount(dialog: HTMLDialogElement): void {
    this.reset();
    this.host = dialog;
    const file = dialog.querySelector<HTMLInputElement>(
      '[data-create-photo-file]',
    );
    dialog
      .querySelector('[data-create-photo-pick]')
      ?.addEventListener('click', () => file?.click());
    dialog
      .querySelector('[data-create-photo-remove]')
      ?.addEventListener('click', () => {
        this.generation++;
        this.photo = null;
        this.failure = null;
        this.paint();
      });
    dialog
      .querySelector('[name=title]')
      ?.addEventListener('input', () => this.paint());
    file?.addEventListener('change', () => {
      const selected = file.files?.[0];
      file.value = '';
      if (selected) this.preparation = this.prepare(selected);
    });
    this.paint();
  }
  async read(): Promise<{ description: string; photo: GroupPhoto | null }> {
    const dialog = this.host;
    await this.preparation;
    if (!dialog || dialog !== this.host)
      throw new Error('Group creation closed.');
    if (this.failure) throw this.failure;
    return {
      description:
        dialog.querySelector<HTMLTextAreaElement>('[name=description]')
          ?.value ?? '',
      photo: this.photo,
    };
  }
  private async prepare(file: File): Promise<void> {
    const generation = ++this.generation,
      dialog = this.host;
    this.failure = null;
    const feedback = dialog?.querySelector('[data-feedback]');
    if (feedback) feedback.textContent = t('Preparing photo…');
    try {
      const photo = await prepareGroupPhoto(file);
      if (generation !== this.generation || this.host !== dialog) return;
      this.photo = photo;
      this.paint();
      if (feedback) feedback.textContent = '';
    } catch (error: unknown) {
      this.failed(error, generation);
    }
  }
  private failed(error: unknown, generation: number): void {
    if (generation !== this.generation) return;
    this.failure =
      error instanceof Error
        ? error
        : new Error('Photo not confirmed. Try again.');
    const feedback = this.host?.querySelector('[data-feedback]');
    if (feedback) feedback.textContent = translatedError(this.failure.message);
  }
  private paint(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    const avatar = this.host?.querySelector<HTMLElement>(
      '[data-create-avatar]',
    );
    if (!avatar) return;
    const title =
      this.host?.querySelector<HTMLInputElement>('[name=title]')?.value ?? '';
    paintAvatar(avatar, { label: title, seed: title });
    if (this.photo) {
      this.url = URL.createObjectURL(groupPhotoBlob(this.photo));
      const image = document.createElement('img');
      image.alt = '';
      image.src = this.url;
      avatar.replaceChildren(image);
    }
    const remove = this.host?.querySelector<HTMLElement>(
      '[data-create-photo-remove]',
    );
    if (remove) remove.hidden = this.photo === null;
  }
}
