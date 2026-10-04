import type { EmojiCatalog } from './catalog.ts';
declare const EMOJI_ASSET_URL: string;
const maximum = 2 * 1024 * 1024;

async function readLimited(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error('Pacote de emojis excedido.');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
function checkedSvg(svg: unknown): string {
  if (
    typeof svg !== 'string' ||
    svg.length > 100_000 ||
    !svg.startsWith('<svg ') ||
    /<(?:script|foreignObject|image|use)\b|\bhref=|\bon[a-z]+=/iu.test(svg)
  )
    throw new Error('Desenho de emoji inválido.');
  return svg;
}
function svgMap(value: unknown): ReadonlyMap<string, string> {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('svg' in value) ||
    typeof value.svg !== 'object' ||
    value.svg === null
  )
    throw new Error('Desenhos de emojis ausentes.');
  const entries = Object.entries(value.svg as Record<string, unknown>);
  if (entries.length !== 4009)
    throw new Error('Desenhos de emojis incompletos.');
  const result = new Map<string, string>();
  for (const [key, svg] of entries) {
    if (!/^[a-f0-9]+(?:-[a-f0-9]+)*$/u.test(key))
      throw new Error('Desenho de emoji inválido.');
    result.set(key, checkedSvg(svg));
  }
  return result;
}
async function loadArtwork(): Promise<ReadonlyMap<string, string>> {
  const response = await fetch(EMOJI_ASSET_URL, {
    redirect: 'error',
    credentials: 'omit',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok || !response.body)
    throw new Error('Pacote de emojis indisponível.');
  const compressed = await readLimited(response.body, maximum);
  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const bytes = await readLimited(stream, 12 * 1024 * 1024);
  return svgMap(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
}
export class EmojiArtwork {
  private pending: Promise<ReadonlyMap<string, string>> | null = null;
  ready(): Promise<ReadonlyMap<string, string>> {
    this.pending ??= loadArtwork();
    return this.pending;
  }
  glyph(emoji: string, catalog: EmojiCatalog): HTMLElement {
    const span = document.createElement('span'),
      row = catalog.find(emoji);
    span.className = 'emoji-glyph';
    span.textContent = emoji;
    span.setAttribute('role', 'img');
    span.setAttribute('aria-label', row?.[1] ?? emoji);
    const key = row?.[4];
    if (!key) return span;
    void this.ready()
      .then((art) => {
        const svg = art.get(key);
        if (span.isConnected && svg) this.paint(span, svg);
      })
      .catch(() => {
        span.title = 'Desenho do aparelho: pacote gráfico indisponível.';
      });
    return span;
  }
  private paint(span: HTMLElement, svg: string): void {
    const img = document.createElement('img'),
      url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    const timeout = setTimeout(() => URL.revokeObjectURL(url), 10_000);
    const release = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
    };
    img.addEventListener(
      'load',
      () => {
        span.classList.add('graphic');
        release();
      },
      { once: true },
    );
    img.addEventListener(
      'error',
      () => {
        img.remove();
        release();
      },
      { once: true },
    );
    img.src = url;
    span.append(img);
  }
  text(host: HTMLElement, text: string, catalog: EmojiCatalog): void {
    host.replaceChildren();
    const segments = new Intl.Segmenter('pt-BR', {
      granularity: 'grapheme',
    }).segment(text);
    let plain = '',
      images = 0;
    for (const { segment } of segments) {
      if (images >= 256 || !catalog.find(segment)) {
        plain += segment;
        continue;
      }
      if (plain) {
        host.append(plain);
        plain = '';
      }
      host.append(this.glyph(segment, catalog));
      images++;
    }
    if (plain) host.append(plain);
  }
}
