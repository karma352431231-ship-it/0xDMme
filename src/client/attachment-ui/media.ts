import { attachmentContent } from '../../shared/attachments/index.ts';
import type { AttachmentContent } from '../../shared/attachments/index.ts';
import { decodeDailyText } from '../../shared/daily/index.ts';
import { voiceDuration } from '../../shared/voice/index.ts';
import { originalImageType } from '../attachment-images/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';

export interface MediaView {
  archived?: boolean;
  id: string;
  text: string;
  peer: string;
}
interface MediaInput<V extends MediaView> {
  content?: AttachmentContent;
  saveNotice?: string;
  article: HTMLElement;
  view: V;
  load: (view: V, thumbnail: boolean) => Promise<Uint8Array<ArrayBuffer>>;
  run: (work: () => Promise<void>) => Promise<void>;
  current: () => boolean;
  retain: (url: string) => void;
  enqueue: (work: () => Promise<void>) => Promise<void>;
  playback: VoicePlayback;
}
function imageCandidate(content: AttachmentContent): boolean {
  return (
    content.image ||
    ['image/png', 'image/jpeg', 'image/webp'].includes(content.type) ||
    /\.(?:png|jpe?g|webp)$/iu.test(content.name)
  );
}
function displayType(bytes: Uint8Array, content: AttachmentContent): string {
  if (content.image && content.type === 'image/gif') return 'image/gif';
  return originalImageType(bytes) ?? 'application/octet-stream';
}
const defaultSaveNotice =
  'A cópia salva fica fora do cofre e da exclusão bilateral. Abra arquivos somente se confiar na origem.';
/** Images are only their content in the bubble; saving lives in the viewer. */
function showImage(
  preview: HTMLElement,
  url: string,
  input: { name: string; saveNotice: string },
): void {
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'chat-image-open';
  open.setAttribute('aria-label', `Ampliar imagem ${input.name}`);
  const image = document.createElement('img');
  image.src = url;
  image.alt = input.name;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => {
    preview.textContent =
      'Não foi possível exibir a imagem. Você pode salvar o arquivo original.';
  });
  open.append(image);
  open.addEventListener('click', () => {
    openImageViewer(url, input);
  });
  preview.replaceChildren(open);
}
/** Full-size view of a decrypted image; the Blob URL stays owned by the chat. */
function openImageViewer(
  url: string,
  input: { name: string; saveNotice: string },
): void {
  const viewer = document.createElement('dialog');
  viewer.className = 'media-viewer';
  viewer.setAttribute('aria-label', input.name);
  const image = document.createElement('img');
  image.src = url;
  image.alt = input.name;
  const bar = document.createElement('div');
  bar.className = 'media-viewer-bar';
  const save = document.createElement('a');
  save.href = url;
  save.download = input.name;
  save.textContent = 'Salvar no aparelho';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Fechar';
  close.addEventListener('click', () => {
    viewer.close();
  });
  const notice = document.createElement('small');
  notice.textContent = input.saveNotice;
  bar.append(save, notice, close);
  viewer.append(image, bar);
  // A click on the backdrop or the image closes; the bar keeps its controls.
  viewer.addEventListener('click', (event) => {
    if (!bar.contains(event.target as Node)) viewer.close();
  });
  viewer.addEventListener('close', () => {
    viewer.remove();
  });
  document.body.append(viewer);
  viewer.showModal();
}
function offerSave<V extends MediaView>(
  input: MediaInput<V>,
  url: string,
  name: string,
): void {
  const save = document.createElement('a');
  save.href = url;
  save.download = name;
  save.textContent = 'Salvar no aparelho';
  const warning = document.createElement('small');
  warning.textContent = input.saveNotice ?? defaultSaveNotice;
  input.article.append(save, warning);
}
/** Images show only their content and the sender's caption, if any. */
function mediaInfo(content: AttachmentContent, image: boolean): string {
  const caption = decodeDailyText(content.caption).text;
  if (image) return caption;
  const label = content.voice
    ? `Mensagem de voz · ${voiceDuration(content.voice)}`
    : content.name;
  const size = `${(content.file.ref.bytes / 1_000_000).toFixed(2)} MB`;
  return `${label} · ${size}${caption ? ` · ${caption}` : ''}`;
}
/** The owner supplies generation checks, serial admission and Blob cleanup. */
export function renderMedia<V extends MediaView>(input: MediaInput<V>): void {
  const content =
      input.content ??
      attachmentContent(JSON.parse(input.view.text) as unknown),
    image = !content.voice && imageCandidate(content),
    info = document.createElement('p'),
    preview = document.createElement('div'),
    button = document.createElement('button');
  info.textContent = mediaInfo(content, image);
  info.hidden = !info.textContent;
  preview.className = 'chat-attachment-preview';
  button.type = 'button';
  button.textContent = content.voice
    ? 'Carregar áudio para ouvir'
    : image
      ? 'Carregar imagem'
      : 'Baixar arquivo original';
  input.article.append(...(image ? [preview, info] : [info, preview]), button);
  button.hidden = image;
  let pending = false;
  async function fetchMedia(): Promise<void> {
    if (!input.current()) return;
    const bytes = await input.load(input.view, false);
    try {
      if (!input.current()) return;
      if (content.voice) {
        input.playback.show({
          bytes,
          voice: content.voice,
          id: input.view.id,
          peer: input.view.archived ? null : input.view.peer,
        });
        return;
      }
      const type = image
          ? displayType(bytes, content)
          : 'application/octet-stream',
        url = URL.createObjectURL(new Blob([bytes], { type }));
      input.retain(url);
      button.hidden = true;
      if (type !== 'application/octet-stream') {
        showImage(preview, url, {
          name: content.name,
          saveNotice: input.saveNotice ?? defaultSaveNotice,
        });
        return;
      }
      if (image)
        preview.textContent =
          'Prévia indisponível para esta imagem. O arquivo original está preservado.';
      offerSave(input, url, content.name);
    } finally {
      bytes.fill(0);
    }
  }
  async function request(): Promise<void> {
    if (pending || !input.current()) return;
    pending = true;
    button.disabled = true;
    try {
      await input.enqueue(fetchMedia);
    } finally {
      pending = false;
      if (input.current()) button.disabled = false;
    }
  }
  button.addEventListener('click', () => {
    void input.run(request);
  });
  if (image) {
    preview.textContent = 'Carregando imagem…';
    // Rendering precedes DOM insertion; the serial queue starts after insertion.
    void Promise.resolve()
      .then(request)
      .catch(() => {
        if (!input.current()) return;
        preview.textContent =
          'Imagem indisponível. Conecte ou toque para tentar novamente.';
        button.textContent = 'Tentar carregar imagem';
        button.hidden = false;
      });
  }
}
