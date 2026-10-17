import { t, translatedError } from '../../shared/i18n/index.ts';
import { dropFilesInto } from '../file-drop/index.ts';
import { showToast } from '../toast/index.ts';
import { fileLimit } from '../../shared/attachments/index.ts';
import type { AttachmentContent } from '../../shared/attachments/index.ts';
import { VoicePlayback } from '../voice-playback/index.ts';
import { prepareAttachment } from '../attachments/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import { renderMedia } from './media.ts';
import type { MediaView } from './media.ts';
export class AttachmentUi {
  private readonly playback: VoicePlayback;
  private readonly changed: () => void;
  /** Product limit of the conversation: 10 MB in private and group chats. */
  private readonly maximum: number;
  constructor(
    playback: VoicePlayback,
    changed: () => void,
    maximum = fileLimit,
  ) {
    this.playback = playback;
    this.changed = changed;
    this.maximum = maximum;
  }
  private selection: AttachmentSelection | null = null;
  private previewUrl: string | null = null;
  private readonly urls = new Set<string>();
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
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
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
          value = await prepareAttachment(file, false, this.maximum).catch(
            (error: unknown) => {
              input.value = '';
              showToast(
                error instanceof Error
                  ? translatedError(error.message)
                  : t('Arquivo inválido.'),
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
      label.textContent = t('Não enviado · some se a página recarregar');
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
    // A compact file card (16/10/2026): thumbnail or file icon, name, size.
    const card = document.createElement('div'),
      copy = document.createElement('span'),
      name = document.createElement('strong'),
      detail = document.createElement('small');
    card.className = 'attachment-card';
    copy.className = 'attachment-card-copy';
    name.textContent = value.name;
    name.title = value.name;
    detail.textContent = t('attachment.card-detail {0}', [
      (value.bytes.length / 1_000_000).toFixed(2),
    ]);
    detail.title = t('attachment.card-metadata');
    copy.append(name, detail);
    card.append(this.cardThumbnail(value), copy);
    area.replaceChildren(card);
  }
  private cardThumbnail(value: AttachmentSelection): Element {
    if (!value.image) return fileIcon();
    const image = document.createElement('img');
    this.previewUrl = URL.createObjectURL(
      new Blob([value.bytes], { type: value.type }),
    );
    image.src = this.previewUrl;
    image.alt = t('Prévia local da imagem original');
    return image;
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
      return Promise.reject(new Error('Mídias em processamento. Aguarde.'));
    this.queued++;
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result.finally(() => {
      this.queued--;
    });
  }
}

function fileIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'attachment-card-file');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of [
    'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
    'M14 3v5h5',
  ]) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
