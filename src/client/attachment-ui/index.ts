import { attachmentContent } from '../../shared/attachments/index.ts';
import { prepareAttachment } from '../attachments/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
interface MediaView {
  id: string;
  text: string;
}
export class AttachmentUi {
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
  clearSelection(): void {
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
  }
  clearMedia(): void {
    this.generation++;
    for (const url of this.urls.splice(0)) URL.revokeObjectURL(url);
  }
  mount(
    host: HTMLElement,
    run: (work: () => Promise<void>) => Promise<void>,
  ): void {
    this.clearSelection();
    this.host = host;
    const input = host.querySelector<HTMLInputElement>(
      '[data-attachment-file]',
    );
    input?.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void run(async () => {
        this.clearSelection();
        const generation = this.selectionGeneration,
          photo =
            host.querySelector<HTMLSelectElement>('[data-attachment-mode]')
              ?.value !== 'file',
          value = await prepareAttachment(file, photo);
        if (generation !== this.selectionGeneration || !host.isConnected) {
          value.bytes.fill(0);
          value.thumbnail?.fill(0);
          return;
        }
        this.selection = value;
        this.preview(host, value);
      });
    });
    host
      .querySelector('[data-attachment-clear]')
      ?.addEventListener('click', () => this.clearSelection());
  }
  private preview(host: HTMLElement, value: AttachmentSelection): void {
    const area = host.querySelector('[data-attachment-preview]');
    if (!area) return;
    const label = document.createElement('p');
    label.textContent = `${value.name} · ${(value.bytes.length / 1_000_000).toFixed(2)} MB. ${value.image ? 'Foto otimizada: pode perder detalhes; metadados privados removidos.' : 'Original: bytes preservados; pode conter GPS/EXIF ou outros metadados.'} Clique em Enviar para compartilhar.`;
    area.replaceChildren(label);
    if (value.image) {
      const image = document.createElement('img');
      this.previewUrl = URL.createObjectURL(
        new Blob([value.bytes], { type: value.type }),
      );
      image.src = this.previewUrl;
      image.alt = 'Prévia local da foto otimizada';
      area.append(image);
    }
  }
  render<V extends MediaView>(input: {
    article: HTMLElement;
    view: V;
    load: (view: V, thumbnail: boolean) => Promise<Uint8Array<ArrayBuffer>>;
    run: (work: () => Promise<void>) => Promise<void>;
  }): void {
    const content = attachmentContent(JSON.parse(input.view.text) as unknown),
      token = this.generation,
      info = document.createElement('p'),
      preview = document.createElement('div'),
      button = document.createElement('button');
    info.textContent = `${content.name} · ${(content.file.ref.bytes / 1_000_000).toFixed(2)} MB${content.caption ? ` · ${content.caption}` : ''}`;
    button.type = 'button';
    button.textContent = content.image
      ? 'Carregar foto completa'
      : 'Baixar arquivo original';
    input.article.append(info, preview, button);
    const current = () =>
      token === this.generation && input.article.isConnected;
    const fetchMedia = async (thumbnail: boolean) => {
      if (!current()) return;
      const bytes = await input.load(input.view, thumbnail);
      if (!current()) {
        bytes.fill(0);
        return;
      }
      const type = thumbnail
          ? 'image/png'
          : content.image
            ? content.type
            : 'application/octet-stream',
        url = URL.createObjectURL(new Blob([bytes], { type }));
      bytes.fill(0);
      this.urls.push(url);
      if (content.image || thumbnail) {
        const image = document.createElement('img');
        image.src = url;
        image.alt = content.name;
        preview.replaceChildren(image);
      }
      if (!thumbnail) {
        button.hidden = true;
        const save = document.createElement('a');
        save.href = url;
        save.download = content.name;
        save.textContent = 'Salvar no aparelho';
        input.article.append(save);
        const warning = document.createElement('small');
        warning.textContent =
          'A cópia salva fica fora do cofre e da exclusão bilateral. Abra arquivos somente se confiar na origem.';
        input.article.append(warning);
      }
    };
    button.addEventListener('click', () => {
      void input.run(() => this.enqueue(() => fetchMedia(false)));
    });
    if (content.thumbnail) {
      void this.enqueue(() => fetchMedia(true)).catch(() => {
        if (!current()) return;
        preview.textContent =
          'Miniatura indisponível. Sincronize ou toque para tentar carregar a foto.';
      });
    }
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
