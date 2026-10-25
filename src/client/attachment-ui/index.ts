import { t, translatedError } from '../../shared/i18n/index.ts';
import { dropFilesInto } from '../file-drop/index.ts';
import { showToast } from '../toast/index.ts';
import { fileLimit } from '../../shared/attachments/index.ts';
import type { AttachmentContent } from '../../shared/attachments/index.ts';
import { VoicePlayback } from '../voice-playback/index.ts';
import { prepareAttachment } from '../attachments/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import { renderMedia } from './media.ts';
import { renderSelectionStrip, renderUsageRing } from './selection-strip.ts';
import {
  AttachmentSelectionQueue,
  attachmentBatchLimit,
  wipe,
} from './selection-queue.ts';
import type { MediaView } from './media.ts';
export { attachmentBatchLimit } from './selection-queue.ts';

export class AttachmentUi {
  private readonly playback: VoicePlayback;
  private readonly changed: () => void;
  /** Product limit of the conversation: 10 MB in private and group chats.
   * Files chosen together share it (owner decision, 24/10/2026). */
  private readonly maximum: number;
  private readonly selections: AttachmentSelectionQueue;
  constructor(
    playback: VoicePlayback,
    changed: () => void,
    maximum = fileLimit,
  ) {
    this.playback = playback;
    this.changed = changed;
    this.maximum = maximum;
    this.selections = new AttachmentSelectionQueue(maximum);
  }
  private readonly previewUrls = new Map<AttachmentSelection, string>();
  private readonly urls = new Set<string>();
  private generation = 0;
  private selectionGeneration = 0;
  private queue: Promise<void> = Promise.resolve();
  private queued = 0;
  private host: HTMLElement | null = null;
  private ring: HTMLElement | null = null;
  /** The next selection to send; senders stage it, then call sent(). */
  get selected(): AttachmentSelection | null {
    return this.selections.first;
  }
  selectVoice(selection: AttachmentSelection, peer: string): void {
    this.clearSelection();
    this.selections.replace(selection);
    this.changed();
    if (this.host?.isConnected) this.preview(this.host, peer);
  }
  pausePreview(): void {
    for (const url of this.previewUrls.values()) URL.revokeObjectURL(url);
    this.previewUrls.clear();
  }
  private previewId(): string {
    return `voice-preview:${this.selectionGeneration}`;
  }
  clearSelection(): void {
    // A discarded voice preview must not keep playing from the dock.
    if (this.selected?.voice) this.playback.release(this.previewId());
    this.discard();
  }
  /** The first selection was staged in the outbox; wipe it and show the rest. */
  sent(): void {
    const first = this.selections.first;
    if (first) this.remove(first);
  }
  private remove(item: AttachmentSelection): void {
    if (this.selections.all.length <= 1) {
      this.clearSelection();
      return;
    }
    this.selections.remove(item);
    const url = this.previewUrls.get(item);
    if (url) URL.revokeObjectURL(url);
    this.previewUrls.delete(item);
    if (this.host) this.preview(this.host);
    this.changed();
  }
  private discard(): void {
    this.selectionGeneration++;
    this.selections.clear();
    this.pausePreview();
    this.host?.querySelector('[data-attachment-preview]')?.replaceChildren();
    const input = this.host?.querySelector<HTMLInputElement>(
      '[data-attachment-file]',
    );
    if (input) input.value = '';
    this.changed();
  }
  clearMedia(): void {
    this.generation++;
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
  }
  mount(
    host: HTMLElement,
    run: (work: () => Promise<void>) => Promise<void>,
  ): void {
    if (!this.selected?.voice) this.clearSelection();
    this.pausePreview();
    this.host = host;
    this.ring = null;
    if (this.selected) this.preview(host, host.dataset['voicePeer'] ?? '');
    const input = host.querySelector<HTMLInputElement>(
      '[data-attachment-file]',
    );
    if (input) {
      input.multiple = true;
      // Dropping files anywhere on the conversation works like the clip.
      dropFilesInto(host, input);
    }
    input?.addEventListener('change', () => {
      const files = [...(input.files ?? [])];
      // Clear at once so choosing the same file again still reports a change.
      input.value = '';
      if (files.length) void run(() => this.add(host, files));
    });
    host
      .querySelector('[data-attachment-clear]')
      ?.addEventListener('click', () => this.clearSelection());
  }
  /** Prepares chosen files one by one after those already waiting. */
  private async add(host: HTMLElement, files: readonly File[]): Promise<void> {
    if (this.selected?.voice) this.clearSelection();
    const generation = this.selectionGeneration;
    for (const file of files)
      if (!(await this.addOne(host, file, generation))) break;
    // With a physical keyboard, Enter right after choosing files sends them.
    if (this.selected && matchMedia('(pointer: fine)').matches)
      host.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }
  /** False once no further file may join this selection. */
  private async addOne(
    host: HTMLElement,
    file: File,
    generation: number,
  ): Promise<boolean> {
    if (this.selections.full) {
      showToast(t('Up to {0} files per send.', [attachmentBatchLimit]));
      return false;
    }
    // A lone file over the limit gets the preparation's own size message.
    if (this.selected && !this.selections.fits(file.size)) {
      this.overLimit();
      return true;
    }
    const value = await this.prepare(file);
    if (!value) return true;
    if (generation !== this.selectionGeneration || !host.isConnected) {
      wipe(value);
      return false;
    }
    if (this.selections.admit(value) !== 'added') this.overLimit();
    else {
      this.preview(host);
      this.changed();
    }
    return true;
  }
  private overLimit(): void {
    showToast(
      t('Files sent together can take up to {0} MB.', [
        this.maximum / 1_000_000,
      ]),
    );
  }
  private prepare(file: File): Promise<AttachmentSelection | null> {
    return prepareAttachment(file, false, this.maximum).catch(
      (error: unknown) => {
        showToast(
          error instanceof Error
            ? translatedError(error.message)
            : t('Invalid file.'),
        );
        return null;
      },
    );
  }
  private preview(
    host: HTMLElement,
    peer = host.dataset['voicePeer'] ?? '',
  ): void {
    const area = host.querySelector('[data-attachment-preview]');
    if (!area) return;
    const first = this.selections.first;
    if (first?.voice) {
      this.previewVoice(area, first, peer);
      return;
    }
    renderSelectionStrip({
      area,
      items: this.selections.all,
      url: (item) => this.previewUrl(item),
      remove: (item) => this.remove(item),
    });
    const ring = this.usageRing(host);
    if (ring)
      renderUsageRing(ring, {
        used: this.selections.used,
        maximum: this.maximum,
      });
  }
  private previewVoice(
    area: Element,
    value: AttachmentSelection,
    peer: string,
  ): void {
    const voice = value.voice!,
      id = this.previewId(),
      label = document.createElement('p');
    // Recorded audio lives only in this page's memory until Enviar.
    label.className = 'voice-preview-note';
    label.textContent = t('Not sent · disappears if the page reloads');
    area.replaceChildren(
      this.playback.element({
        id,
        voice,
        load: () => {
          this.playback.play({ bytes: value.bytes, voice, id, peer });
          return Promise.resolve();
        },
      }),
      label,
    );
    this.ring?.remove();
    this.ring = null;
  }
  /** Sits under the clear-all button of this composer. */
  private usageRing(host: HTMLElement): HTMLElement | null {
    if (this.ring?.isConnected) return this.ring;
    const clear = host.querySelector('[data-attachment-clear]');
    if (!clear) return null;
    this.ring = document.createElement('span');
    this.ring.className = 'attachment-ring';
    this.ring.setAttribute('role', 'img');
    clear.after(this.ring);
    return this.ring;
  }
  private previewUrl(item: AttachmentSelection): string | null {
    if (!item.image && !item.type.startsWith('video/')) return null;
    let url = this.previewUrls.get(item);
    if (!url) {
      url = URL.createObjectURL(new Blob([item.bytes], { type: item.type }));
      this.previewUrls.set(item, url);
    }
    return url;
  }
  render<V extends MediaView>(input: {
    content?: AttachmentContent;
    saveNotice?: string;
    signal?: AbortSignal;
    article: HTMLElement;
    view: V;
    load: (view: V, thumbnail: boolean) => Promise<Uint8Array<ArrayBuffer>>;
    run: (work: () => Promise<void>) => Promise<void>;
  }): void {
    const token = this.generation;
    renderMedia({
      ...input,
      playback: this.playback,
      current: () =>
        token === this.generation &&
        !input.signal?.aborted &&
        input.article.isConnected,
      retain: (url) => {
        this.urls.add(url);
        input.signal?.addEventListener(
          'abort',
          () => {
            if (this.urls.delete(url)) URL.revokeObjectURL(url);
          },
          { once: true },
        );
      },
      enqueue: (work) => this.enqueue(work),
    });
  }
  private enqueue(work: () => Promise<void>): Promise<void> {
    if (this.queued >= 18)
      return Promise.reject(new Error('Processing media. Please wait.'));
    this.queued++;
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result.finally(() => {
      this.queued--;
    });
  }
}
