import { dropFilesInto } from '../file-drop/index.ts';
import { showToast } from '../toast/index.ts';
import type { AttachmentContent } from '../../shared/attachments/index.ts';
import { VoicePlayback } from '../voice-playback/index.ts';
import { prepareAttachment } from '../attachments/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import { renderMedia } from './media.ts';
import type { MediaView } from './media.ts';
export class AttachmentUi {
  private readonly playback: VoicePlayback;
  private readonly changed: () => void;
  constructor(playback: VoicePlayback, changed: () => void) {
    this.playback = playback;
    this.changed = changed;
  }
  private selection: AttachmentSelection | null = null;
  private previewUrl: string | null = null;
  private readonly urls: string[] = [];
  private generation = 0;
  private selectionGeneration = 0;
  private queue: Promise<void> = Promise.resolve();
  private queued = 0;
  private host: HTMLElement | null = null;
  get selected(): AttachmentSelection | null {
    return this.selection;
  }
  selectVoice(selection: AttachmentSelection, peer: string): void {
    this.clearSelection();
    this.selection = selection;
    this.changed();
    if (this.host?.isConnected) this.preview(this.host, selection, peer);
  }
  pausePreview(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
  }
  private previewId(): string {
    return `voice-preview:${this.selectionGeneration}`;
  }
  clearSelection(): void {
    // A discarded voice preview must not keep playing from the dock.
    if (this.selection?.voice) this.playback.release(this.previewId());
    this.discard();
  }
  private discard(): void {
    this.selectionGeneration++;
    this.selection?.bytes.fill(0);
    this.selection?.thumbnail?.fill(0);
    this.selection = null;
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    this.host?.querySelector('[data-attachment-preview]')?.replaceChildren();
    const input = this.host?.querySelector<HTMLInputElement>(
      '[data-attachment-file]',
    );
    if (input) input.value = '';
    this.changed();
  }
  clearMedia(): void {
    this.generation++;
    for (const url of this.urls.splice(0)) URL.revokeObjectURL(url);
  }
  mount(
    host: HTMLElement,
    run: (work: () => Promise<void>) => Promise<void>,
  ): void {
    if (!this.selection?.voice) this.clearSelection();
    this.pausePreview();
    this.host = host;
    if (this.selection)
      this.preview(host, this.selection, host.dataset['voicePeer'] ?? '');
    const input = host.querySelector<HTMLInputElement>(
      '[data-attachment-file]',
    );
    // Dropping a file anywhere on the conversation works like the clip.
    if (input) dropFilesInto(host, input);
    input?.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void run(async () => {
        this.clearSelection();
        const generation = this.selectionGeneration,
          value = await prepareAttachment(file, false).catch(
            (error: unknown) => {
              input.value = '';
              showToast(
                error instanceof Error ? error.message : 'Arquivo inválido.',
              );
              return null;
            },
          );
        if (!value) return;
        if (generation !== this.selectionGeneration || !host.isConnected) {
          value.bytes.fill(0);
          value.thumbnail?.fill(0);
          return;
        }
        this.selection = value;
        this.preview(host, value);
        this.changed();
        // With a physical keyboard, Enter right after choosing a file sends it.
        if (matchMedia('(pointer: fine)').matches)
          host.querySelector<HTMLTextAreaElement>('textarea')?.focus();
      });
    });
    host
      .querySelector('[data-attachment-clear]')
      ?.addEventListener('click', () => this.clearSelection());
  }
  private preview(
    host: HTMLElement,
    value: AttachmentSelection,
    peer = host.dataset['voicePeer'] ?? '',
  ): void {
    const area = host.querySelector('[data-attachment-preview]');
    if (!area) return;
    const label = document.createElement('p');
    if (value.voice) {
      const voice = value.voice,
        id = this.previewId();
      // Recorded audio lives only in this page's memory until Enviar.
      label.className = 'voice-preview-note';
      label.textContent = 'Não enviado · some se a página recarregar';
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
      return;
    }
    label.textContent = `${value.name} · ${(value.bytes.length / 1_000_000).toFixed(2)} MB. Original preservado; pode conter GPS/EXIF ou outros metadados. Clique em Enviar para compartilhar.`;
    area.replaceChildren(label);
    if (value.image) {
      const image = document.createElement('img');
      this.previewUrl = URL.createObjectURL(
        new Blob([value.bytes], { type: value.type }),
      );
      image.src = this.previewUrl;
      image.alt = 'Prévia local da imagem original';
      area.append(image);
    }
  }
  render<V extends MediaView>(input: {
    content?: AttachmentContent;
    saveNotice?: string;
    article: HTMLElement;
    view: V;
    load: (view: V, thumbnail: boolean) => Promise<Uint8Array<ArrayBuffer>>;
    run: (work: () => Promise<void>) => Promise<void>;
  }): void {
    const token = this.generation;
    renderMedia({
      ...input,
      playback: this.playback,
      current: () => token === this.generation && input.article.isConnected,
      retain: (url) => {
        this.urls.push(url);
      },
      enqueue: (work) => this.enqueue(work),
    });
  }
  private enqueue(work: () => Promise<void>): Promise<void> {
    if (this.queued >= 18)
      return Promise.reject(new Error('Mídias em processamento. Aguarde.'));
    this.queued++;
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result.finally(() => {
      this.queued--;
    });
  }
}
