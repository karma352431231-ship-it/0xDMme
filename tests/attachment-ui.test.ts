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
  readonly dataset: Record<string, string> = {};
  get ownerDocument(): Document {
    return document;
  }
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
  readonly attributes = new Map<string, string>();
  readonly style = { setProperty() {} };
  readonly classList = {
    add: (name: string) => {
      this.className += ' ' + name;
    },
  };
  controls = false;
  paused = true;
  seeking = false;
  readyState = 0;
  currentTime = 0;
  load(): void {}
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {}
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  toggleAttribute(name: string, active: boolean): void {
    if (active) this.attributes.set(name, '');
    else this.attributes.delete(name);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === 'src') this.src = '';
    if (name === 'href') this.href = '';
  }
  addEventListener(event: string, callback: () => void): void {
    this.listeners.set(event, callback);
  }
  click(): void {
    this.listeners.get('click')?.();
  }
  showModal(): void {}
  close(): void {}
  remove(): void {}
  contains(): boolean {
    return false;
  }
  querySelector(selector: string): MediaNode | null {
    for (const child of this.children) {
      if (child.tag === selector) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
}
function environment(t: TestContext, playback?: Partial<VoicePlayback>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const body = new MediaNode('body');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (tag: string) => new MediaNode(tag),
      createElementNS: (_ns: string, tag: string) => new MediaNode(tag),
      body,
    },
  });
  // Decoding the original before it replaces a preview.
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    value: class {
      src = '';
      decode(): Promise<void> {
        return Promise.resolve();
      }
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
    if (previousImage)
      Object.defineProperty(globalThis, 'Image', previousImage);
    else Reflect.deleteProperty(globalThis, 'Image');
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
    (playback ?? {
      play: () => {
        throw new Error('Áudio não deve tocar automaticamente.');
      },
    }) as unknown as VoicePlayback,
    () => {},
  );
  return { ui, blobs, revoked, body };
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
/** The save link inside the image viewer opened on the fake document body. */
function viewerSaveLink(body: MediaNode): MediaNode | undefined {
  const bar = body.children[0]?.children.find(
    (node) => node.className === 'media-viewer-bar',
  );
  return bar?.children.find((node) => node.tag === 'a');
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
await test('chat video toggles its lower controls during playback and hides them after two seconds without interaction', async (t) => {
  const { ui, blobs, revoked } = environment(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const observer = Object.getOwnPropertyDescriptor(
    globalThis,
    'IntersectionObserver',
  );
  let visibility: (entries: { isIntersecting: boolean }[]) => void = () => {};
  let disconnected = false;
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: class {
      constructor(callback: typeof visibility) {
        visibility = callback;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
  });
  t.after(() => {
    if (observer)
      Object.defineProperty(globalThis, 'IntersectionObserver', observer);
    else Reflect.deleteProperty(globalThis, 'IntersectionObserver');
  });
  const signal = new AbortController();
  const row = new MediaNode('article');
  const bytes = Uint8Array.of(
    0,
    0,
    0,
    16,
    102,
    116,
    121,
    112,
    105,
    115,
    111,
    109,
    0,
    0,
    0,
    0,
  );
  let loads = 0;
  ui.render({
    article: row as unknown as HTMLElement,
    content: { ...content('video/mp4'), name: 'sample.mp4' },
    signal: signal.signal,
    view: { id: 'video', peer: 'synthetic', text: '' },
    load: () => {
      loads++;
      return Promise.resolve(bytes);
    },
    run: (work) => work(),
  });
  const figure = row.children[0]!;
  const stage = figure.children[0]!;
  const retry = figure.children[2]!;
  const video = stage.children[0]!;
  const surface = stage.children[1]!;
  const toolbar = stage.children[4]!;
  assert.equal(video.tag, 'video');
  assert.equal(video.controls, false);
  assert.equal(video.attributes.has('playsinline'), true);
  assert.deepEqual(
    figure.children.map((node) => node.tag),
    ['div', 'span', 'button'],
  );
  assert.equal(retry.hidden, true);
  assert.equal(loads, 0);
  visibility([{ isIntersecting: true }]);
  await flush();
  assert.equal(loads, 1);
  assert.equal(video.src, 'blob:synthetic-1');
  assert.deepEqual(row.children, [figure]);
  const seeks: number[] = [];
  Object.defineProperty(video, 'currentTime', {
    get: () => 0,
    set: (time: number) => seeks.push(time),
  });
  video.listeners.get('loadedmetadata')!();
  assert.deepEqual(seeks, [0]);
  assert.equal(video.paused, true);
  assert.equal(toolbar.hidden, true);
  surface.click();
  assert.equal(toolbar.hidden, false);
  assert.equal(stage.dataset['controlsVisible'], 'true');
  video.paused = false;
  surface.click();
  assert.equal(toolbar.hidden, true);
  assert.equal(stage.dataset['controlsVisible'], undefined);
  surface.click();
  assert.equal(toolbar.hidden, false);
  assert.equal(stage.dataset['controlsVisible'], 'true');
  assert.equal(video.paused, false);
  t.mock.timers.tick(1999);
  assert.equal(toolbar.hidden, false);
  toolbar.listeners.get('click')!();
  t.mock.timers.tick(1999);
  assert.equal(toolbar.hidden, false);
  t.mock.timers.tick(1);
  assert.equal(toolbar.hidden, true);
  assert.equal(stage.dataset['controlsVisible'], undefined);
  assert.equal(blobs[0]!.type, 'video/mp4');
  assert.ok(bytes.every((byte) => byte === 0));
  visibility([{ isIntersecting: false }]);
  visibility([{ isIntersecting: true }]);
  assert.equal(loads, 1);
  signal.abort();
  assert.equal(disconnected, true);
  assert.equal(video.src, '');
  assert.deepEqual(revoked, ['blob:synthetic-1']);
});
await test('an image overlay shares the image frame and survives preview loading', async (t) => {
  const { ui, blobs, revoked } = environment(t);
  const article = new MediaNode('article');
  const reactions = new MediaNode('div');
  reactions.className = 'message-reactions';
  ui.render({
    article: article as unknown as HTMLElement,
    imageOverlay: reactions as unknown as HTMLElement,
    content: content('image/png', true),
    view: { id: crypto.randomUUID(), text: '', peer: crypto.randomUUID() },
    load: () => Promise.resolve(png()),
    run: (work) => work(),
  });
  const frame = article.children.find(
    (node) => node.className === 'chat-image-frame',
  )!;
  const preview = frame.children[0]!;
  assert.equal(frame.children[1], reactions);
  await flush();
  const image = preview.children[0]?.children[0];
  assert.equal(image?.src, 'blob:synthetic-1');
  reactions.textContent = '😂';
  assert.equal(preview.children[0]?.children[0], image);
  assert.equal(frame.children[1], reactions);
  assert.equal(blobs.length, 1);
  assert.deepEqual(revoked, []);
});
function render(
  ui: AttachmentUi,
  load: () => Promise<Uint8Array<ArrayBuffer>>,
  media = content(),
  signal?: AbortSignal,
) {
  const article = new MediaNode('article');
  ui.render({
    article: article as unknown as HTMLElement,
    content: media,
    ...(signal ? { signal } : {}),
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
    preview: article.children.find(
      (node) => node.className === 'chat-attachment-preview',
    )!,
    button: article.children.find((node) => node.tag === 'button')!,
  };
}
await test('legacy image sent as a file appears automatically and preserves the original for saving', async (t) => {
  const { ui, blobs, revoked, body } = environment(t),
    bytes = png(),
    original = bytes.slice();
  let loads = 0;
  const { article, preview, button } = render(ui, () => {
    loads++;
    return Promise.resolve(bytes);
  });
  await flush();
  assert.equal(loads, 1);
  // The bubble shows only the image; it opens the viewer that offers saving.
  const open = preview.children[0];
  assert.equal(open?.tag, 'button');
  assert.equal(open?.children[0]?.tag, 'img');
  assert.equal(open?.children[0]?.src, 'blob:synthetic-1');
  assert.equal(blobs[0]?.type, 'image/png');
  assert.deepEqual(new Uint8Array(await blobs[0].arrayBuffer()), original);
  assert.equal(
    bytes.every((byte) => byte === 0),
    true,
  );
  assert.equal(button.hidden, true);
  assert.equal(
    article.children.some((node) => node.tag === 'a'),
    false,
  );
  open?.click();
  const save = viewerSaveLink(body);
  assert.equal(save?.download, 'foto.png');
  assert.equal(save?.href, 'blob:synthetic-1');
  ui.clearMedia();
  assert.deepEqual(revoked, ['blob:synthetic-1']);
});
await test('generic file stays on demand and chat never renders HTML', async (t) => {
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
await test('conversation change during download discards bytes without recreating an image or Blob', async (t) => {
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
await test('automatic failures retry twice, then allow one explicit retry without duplicate downloads', async (t) => {
  const { ui, blobs } = environment(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let loads = 0;
  const { preview, button } = render(ui, () => {
    loads++;
    if (loads <= 3) return Promise.reject(new Error('Offline'));
    return Promise.resolve(png());
  });
  await flush();
  assert.equal(loads, 1);
  assert.equal(button.hidden, true, 'no tap is asked for while retrying');
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(loads, 2);
  t.mock.timers.tick(3000);
  await flush();
  assert.equal(loads, 3);
  assert.match(preview.textContent, /unavailable/);
  button.click();
  button.click();
  await flush();
  assert.equal(loads, 4);
  assert.equal(blobs.length, 1);
  assert.equal(preview.children[0]?.children[0]?.tag, 'img');
});

await test('a preview that fails once while the conversation settles loads without a tap', async (t) => {
  const { ui, blobs } = environment(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let loads = 0;
  const { preview, button } = render(ui, () => {
    loads++;
    if (loads === 1) return Promise.reject(new Error('Not ready'));
    return Promise.resolve(png());
  });
  await flush();
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(loads, 2);
  assert.equal(button.hidden, true);
  assert.equal(blobs.length, 1);
  assert.equal(preview.children[0]?.children[0]?.tag, 'img');
});

await test('voice message shows only the player and downloads audio only on play', async (t) => {
  const players: { load: () => Promise<void> }[] = [],
    played: number[][] = [];
  const { ui } = environment(t, {
    element: (input) => {
      players.push(input);
      return new MediaNode('div') as unknown as HTMLElement;
    },
    play: (input) => {
      played.push([...input.bytes]);
    },
  });
  const bytes = new Uint8Array([1, 2, 3]);
  let loads = 0;
  const { article } = render(
    ui,
    () => {
      loads++;
      return Promise.resolve(bytes);
    },
    {
      ...content('audio/wav'),
      name: 'mensagem-de-voz.wav',
      voice: { samples: 16000, sampleRate: 16000 },
    },
  );
  await flush();
  assert.equal(loads, 0);
  assert.deepEqual(
    article.children.map((node) => node.tag),
    ['div'],
  );
  await players[0]?.load();
  assert.equal(loads, 1);
  assert.deepEqual(played, [[1, 2, 3]]);
  assert.ok(bytes.every((value) => value === 0));
});

await test('removing a bubble revokes only its Blob; other images remain loaded', async (t) => {
  const { ui, revoked, blobs } = environment(t),
    stop = new AbortController(),
    other = new AbortController();
  render(ui, () => Promise.resolve(png()), content(), stop.signal);
  const retained = render(
    ui,
    () => Promise.resolve(png()),
    content(),
    other.signal,
  );
  await flush();
  assert.equal(blobs.length, 2);
  stop.abort();
  assert.deepEqual(revoked, ['blob:synthetic-1']);
  assert.equal(
    retained.preview.children[0]?.children[0]?.src,
    'blob:synthetic-2',
  );
  ui.clearMedia();
  assert.deepEqual(revoked, ['blob:synthetic-1', 'blob:synthetic-2']);
});

await test("deletion during download discards only the removed bubble's bytes", async (t) => {
  const { ui, blobs } = environment(t),
    stop = new AbortController();
  let finish: (bytes: Uint8Array<ArrayBuffer>) => void = () => {
    throw new Error('Não iniciado');
  };
  const download = new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
    finish = resolve;
  });
  render(ui, () => download, content(), stop.signal);
  await flush();
  stop.abort();
  const bytes = png();
  finish(bytes);
  await flush();
  assert.equal(blobs.length, 0);
  assert.ok(bytes.every((value) => value === 0));
});

await test('conversation-supplied attachment captions preserve legacy literals and group text budgets', (t) => {
  const { ui } = environment(t);
  for (const caption of ['\u001e0xdmme:1:not-structured', 'x'.repeat(32000)]) {
    const article = new MediaNode('article');
    ui.render({
      article: article as unknown as HTMLElement,
      content: {
        ...content('text/plain'),
        caption: '\u001e0xdmme:1:not-structured',
      },
      caption,
      view: { id: crypto.randomUUID(), peer: crypto.randomUUID(), text: '' },
      load: () => Promise.reject(new Error('No download requested.')),
      run: (work) => work(),
    });
    assert.ok(article.children[0]!.textContent.endsWith(' · ' + caption));
  }
});

await test('an authenticated thumbnail shows first, then the original replaces it; opening reuses that original', async (t) => {
  const { ui, blobs, body } = environment(t);
  const article = new MediaNode('article'),
    media = content('image/png', true);
  media.thumbnail = {
    ...media.file,
    ref: { ...media.file.ref, id: crypto.randomUUID() },
  };
  const loads: boolean[] = [];
  ui.render({
    article: article as unknown as HTMLElement,
    content: media,
    view: { id: 'photo', peer: 'peer', text: '' },
    load: (_view, thumbnail) => {
      loads.push(thumbnail);
      return Promise.resolve(png());
    },
    run: (work) => work(),
  });
  await flush();
  // Quick preview, then full quality (owner, 13/11/2026).
  assert.deepEqual(loads, [true, false]);
  assert.equal(blobs.length, 2);
  assert.equal(article.querySelector('img')?.src, 'blob:synthetic-2');
  article.children[0]!.children[0]!.click();
  await flush();
  assert.deepEqual(loads, [true, false], 'the original was read again');
  assert.equal(viewerSaveLink(body)?.href, 'blob:synthetic-2');
  assert.equal(viewerSaveLink(body)?.download, media.name);
});
await test('a warm derived image shows at once and is replaced by its original; a detached row presents nothing late', async (t) => {
  const { ui, blobs } = environment(t);
  const article = new MediaNode('article');
  let originals = 0;
  ui.render({
    article: article as unknown as HTMLElement,
    content: content('image/png', true),
    view: { id: 'photo', peer: 'peer', text: '' },
    previews: {
      read: () => Promise.resolve(png()),
      save: () => Promise.resolve(),
    },
    load: () => {
      originals++;
      return Promise.resolve(png());
    },
    run: (work) => work(),
  });
  await flush();
  assert.equal(originals, 1, 'one background read reaches full quality');
  assert.equal(blobs.length, 2);
  assert.equal(article.querySelector('img')?.src, 'blob:synthetic-2');
  let finish: (bytes: Uint8Array<ArrayBuffer>) => void = () => {};
  const pending = new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
    finish = resolve;
  });
  const other = new MediaNode('article');
  ui.render({
    article: other as unknown as HTMLElement,
    content: content('image/png', true),
    view: { id: 'closed', peer: 'peer', text: '' },
    previews: { read: () => pending, save: () => Promise.resolve() },
    load: () => {
      originals++;
      return Promise.resolve(png());
    },
    run: (work) => work(),
  });
  await flush();
  other.isConnected = false;
  const bytes = png();
  finish(bytes);
  await flush();
  assert.equal(blobs.length, 2);
  assert.ok(bytes.every((byte) => byte === 0));
  assert.equal(originals, 1, 'the detached row read no original');
});
await test('a chat video shows its warm poster first, then loads its source quietly without playing', async (t) => {
  const { ui, blobs, revoked } = environment(t);
  let visible: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    'IntersectionObserver',
  );
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: class {
      constructor(callback: typeof visible) {
        visible = callback;
      }
      observe() {}
      disconnect() {}
    },
  });
  t.after(() => {
    if (previous)
      Object.defineProperty(globalThis, 'IntersectionObserver', previous);
    else Reflect.deleteProperty(globalThis, 'IntersectionObserver');
  });
  const article = new MediaNode('article'),
    signal = new AbortController();
  let originals = 0;
  ui.render({
    article: article as unknown as HTMLElement,
    signal: signal.signal,
    content: content('video/mp4'),
    view: { id: 'video', peer: 'peer', text: '' },
    previews: {
      read: () => Promise.resolve(png()),
      save: () => Promise.resolve(),
    },
    load: () => {
      originals++;
      return Promise.resolve(
        Uint8Array.of(
          0,
          0,
          0,
          16,
          102,
          116,
          121,
          112,
          105,
          115,
          111,
          109,
          0,
          0,
          0,
          0,
        ),
      );
    },
    run: (work) => work(),
  });
  visible([{ isIntersecting: true }]);
  await flush();
  const figure = article.children[0]!,
    stage = figure.children[0]!,
    video = stage.children[0]!;
  // The poster shows at once; the source follows for full quality (owner,
  // 13/11/2026), without starting playback.
  assert.equal(originals, 1);
  assert.equal(video.src, 'blob:synthetic-2');
  assert.equal(video.paused, true);
  assert.equal(blobs.length, 2);
  // Becoming visible again reads nothing more.
  visible([{ isIntersecting: false }]);
  visible([{ isIntersecting: true }]);
  await flush();
  assert.equal(originals, 1);
  signal.abort();
  assert.equal(revoked.length, 2);
});
