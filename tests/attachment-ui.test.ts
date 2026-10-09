import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { AttachmentUi } from '../src/client/attachment-ui/index.ts';
import type { VoicePlayback } from '../src/client/voice-playback/index.ts';
import type { AttachmentContent } from '../src/shared/attachments/index.ts';

class MediaNode {
  readonly tag: string;
  readonly listeners = new Map<string, () => void>();
  children: MediaNode[] = [];
  textContent = '';
  className = '';
  src = '';
  href = '';
  alt = '';
  download = '';
  hidden = false;
  disabled = false;
  isConnected = true;
  constructor(tag: string) {
    this.tag = tag;
  }
  append(...nodes: MediaNode[]): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: MediaNode[]): void {
    this.children = nodes;
    this.textContent = '';
  }
  addEventListener(event: string, callback: () => void): void {
    this.listeners.set(event, callback);
  }
  click(): void {
    this.listeners.get('click')?.();
  }
}
function environment(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => new MediaNode(tag) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const blobs: Blob[] = [],
    revoked: string[] = [];
  t.mock.method(URL, 'createObjectURL', (blob: Blob) => {
    blobs.push(blob);
    return 'blob:synthetic-' + blobs.length;
  });
  t.mock.method(URL, 'revokeObjectURL', (url: string) => {
    revoked.push(url);
  });
  const ui = new AttachmentUi(
    {
      show: () => {
        throw new Error('Áudio não deve tocar automaticamente.');
      },
    } as unknown as VoicePlayback,
    () => {},
  );
  return { ui, blobs, revoked };
}
function content(type = 'image/png', image = false): AttachmentContent {
  return {
    version: 1,
    name: image || type.startsWith('image/') ? 'foto.png' : 'arquivo.txt',
    type,
    image,
    caption: '',
    thumbnail: null,
    file: {
      encryption: '{}',
      ref: {
        id: crypto.randomUUID(),
        bytes: 57,
        hash: 'a'.repeat(64),
        parts: [{ bytes: 57, hash: 'a'.repeat(64) }],
      },
    },
  };
}
function png(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(57),
    view = new DataView(bytes.buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  view.setUint32(16, 320);
  view.setUint32(20, 200);
  bytes.set(new TextEncoder().encode('IDAT'), 37);
  bytes.set(new TextEncoder().encode('IEND'), 49);
  return bytes;
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function render(
  ui: AttachmentUi,
  load: () => Promise<Uint8Array<ArrayBuffer>>,
  media = content(),
) {
  const article = new MediaNode('article');
  ui.render({
    article: article as unknown as HTMLElement,
    content: media,
    view: { id: crypto.randomUUID(), text: '', peer: crypto.randomUUID() },
    load: (_view, thumbnail) => {
      assert.equal(thumbnail, false);
      return load();
    },
    run: async (work) => {
      await work();
    },
  });
  return {
    article,
    preview: article.children[1]!,
    button: article.children[2]!,
  };
}
await test('imagem antiga enviada como arquivo aparece automaticamente e mantém o original para salvar', async (t) => {
  const { ui, blobs, revoked } = environment(t),
    bytes = png(),
    original = bytes.slice();
  let loads = 0;
  const { article, preview, button } = render(ui, () => {
    loads++;
    return Promise.resolve(bytes);
  });
  await flush();
  assert.equal(loads, 1);
  assert.equal(preview.children[0]?.tag, 'img');
  assert.equal(preview.children[0]?.src, 'blob:synthetic-1');
  assert.equal(blobs[0]?.type, 'image/png');
  assert.deepEqual(new Uint8Array(await blobs[0].arrayBuffer()), original);
  assert.equal(
    bytes.every((byte) => byte === 0),
    true,
  );
  assert.equal(button.hidden, true);
  assert.equal(
    article.children.find((node) => node.tag === 'a')?.download,
    'foto.png',
  );
  ui.clearMedia();
  assert.deepEqual(revoked, ['blob:synthetic-1']);
});
await test('arquivo genérico permanece sob demanda e HTML não é renderizado no chat', async (t) => {
  const { ui, blobs } = environment(t);
  let loads = 0;
  const { preview, button } = render(
    ui,
    () => {
      loads++;
      return Promise.resolve(new TextEncoder().encode('<script>erro</script>'));
    },
    content('text/html'),
  );
  await flush();
  assert.equal(loads, 0);
  button.click();
  await flush();
  assert.equal(loads, 1);
  assert.equal(blobs[0]?.type, 'application/octet-stream');
  assert.equal(preview.children.length, 0);
});
await test('troca de conversa durante download descarta bytes sem recriar imagem ou Blob', async (t) => {
  const { ui, blobs } = environment(t);
  let finish: (bytes: Uint8Array<ArrayBuffer>) => void = () => {
    throw new Error('Download não iniciado.');
  };
  const download = new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
    finish = resolve;
  });
  const { preview } = render(ui, () => download);
  await flush();
  ui.clearMedia();
  const bytes = png();
  finish(bytes);
  await flush();
  assert.equal(blobs.length, 0);
  assert.equal(preview.children.length, 0);
  assert.equal(
    bytes.every((byte) => byte === 0),
    true,
  );
});
await test('falha automática permite uma tentativa explícita, sem duplicar download por clique repetido', async (t) => {
  const { ui, blobs } = environment(t);
  let loads = 0;
  const { preview, button } = render(ui, () => {
    loads++;
    if (loads === 1) return Promise.reject(new Error('Offline'));
    return Promise.resolve(png());
  });
  await flush();
  assert.equal(loads, 1);
  assert.match(preview.textContent, /indisponível/);
  button.click();
  button.click();
  await flush();
  assert.equal(loads, 2);
  assert.equal(blobs.length, 1);
  assert.equal(preview.children[0]?.tag, 'img');
});
