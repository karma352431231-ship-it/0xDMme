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
function showImage(preview: HTMLElement, url: string, name: string): void {
  const image = document.createElement('img');
  image.src = url;
  image.alt = name;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => {
    preview.textContent =
      'Não foi possível exibir a imagem. Você pode salvar o arquivo original.';
  });
  preview.replaceChildren(image);
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
  warning.textContent =
    input.saveNotice ??
    'A cópia salva fica fora do cofre e da exclusão bilateral. Abra arquivos somente se confiar na origem.';
  input.article.append(save, warning);
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
  const caption = decodeDailyText(content.caption).text;
  info.textContent = `${content.voice ? 'Mensagem de voz · ' + voiceDuration(content.voice) : content.name} · ${(content.file.ref.bytes / 1_000_000).toFixed(2)} MB${caption ? ` · ${caption}` : ''}`;
  preview.className = 'chat-attachment-preview';
  button.type = 'button';
  button.textContent = content.voice
    ? 'Carregar áudio para ouvir'
    : image
      ? 'Carregar imagem'
      : 'Baixar arquivo original';
  input.article.append(info, preview, button);
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
      if (type !== 'application/octet-stream')
        showImage(preview, url, content.name);
      else if (image)
        preview.textContent =
          'Prévia indisponível para esta imagem. O arquivo original está preservado.';
      button.hidden = true;
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
      });
  }
}
