import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  galleryItems,
  galleryCount,
  tileSource,
  MediaCatalogue,
  catalogueIdentity,
} from '../src/client/media-gallery/index.ts';
import type { DailyRow, DailyView } from '../src/client/daily-text/index.ts';
import { watchGalleryHistory } from '../src/client/media-gallery/history.ts';
import { deferred } from './fixtures/deferred.ts';

function file(bytes: number) {
  return {
    ref: {
      id: crypto.randomUUID(),
      hash: 'a'.repeat(64),
      bytes,
      parts: [{ hash: 'b'.repeat(64), bytes }],
    },
    encryption: '{}',
  };
}
function attachment(name: string, type: string, image: boolean) {
  return JSON.stringify({
    version: 1,
    name,
    type,
    caption: '',
    image,
    file: file(2048),
    thumbnail: image ? file(64) : null,
  });
}
type Row = DailyRow & { sentAt: number };
function view(input: {
  id: string;
  kind: string;
  text: string;
  sentAt: number;
  viewOnce?: boolean;
}): DailyView<Row> {
  const text = input.kind === 'text' ? input.text : '';
  return {
    id: input.id,
    hash: 'h',
    text: input.text,
    own: true,
    kind: input.kind,
    peer: 'p',
    sentAt: input.sentAt,
    content: {
      text,
      reply: null,
      forwarded: false,
      ...(input.viewOnce ? { viewOnce: {} } : {}),
    } as DailyView<Row>['content'],
    edited: false,
    reactions: [],
    ownReaction: '',
    pin: null,
  };
}

await test('photos and videos, documents and links of loaded messages, newest first, without view-once', () => {
  const now = new Date(2026, 10, 12).getTime(),
    october = new Date(2026, 9, 3).getTime();
  const items = galleryItems(
    [
      view({
        id: 'photo',
        kind: 'attachment',
        text: attachment('p.jpg', 'image/jpeg', true),
        sentAt: october,
      }),
      view({
        id: 'video',
        kind: 'attachment',
        text: attachment('v.mp4', 'video/mp4', false),
        sentAt: now,
      }),
      view({
        id: 'pdf',
        kind: 'attachment',
        text: attachment('doc.pdf', 'application/pdf', false),
        sentAt: now,
      }),
      view({ id: 'broken', kind: 'attachment', text: '{', sentAt: now }),
      view({
        id: 'link',
        kind: 'text',
        text: 'See https://example.com/a).',
        sentAt: now,
      }),
      view({
        id: 'once',
        kind: 'text',
        text: 'https://hidden.example',
        sentAt: now,
        viewOnce: true,
      }),
    ],
    now,
  );
  assert.deepEqual(
    items.media.map((m) => [m.view.id, m.video, m.preview, m.month.label]),
    [
      ['video', true, false, 'This month'],
      ['photo', false, true, 'October'],
    ],
  );
  assert.deepEqual(
    items.docs.map((d) => [d.name, d.bytes]),
    [['doc.pdf', 2048]],
  );
  assert.deepEqual(
    items.links.map((link) => [link.url, link.host]),
    [['https://example.com/a', 'example.com']],
  );
  assert.equal(galleryCount(items), 4);
  // A legacy video still appears in the count but cannot fetch its original as a tile.
  assert.deepEqual(items.media.map(tileSource), [
    { thumbnail: false },
    { thumbnail: true },
  ]);
});

await test('catalogue counts every tab before the gallery opens and continues metadata while previews are held', async (t) => {
  const catalogue = new MediaCatalogue<Row>();
  t.after(() => catalogue.clear());
  const preview = deferred<Uint8Array<ArrayBuffer>>();
  const complete = deferred<void>();
  const media: string[] = [];
  const pages: (number | null)[] = [];
  const records = [
    ...Array.from({ length: 36 }, (_, index) =>
      view({
        id: 'photo-' + index,
        kind: 'attachment',
        text: attachment('p.jpg', 'image/jpeg', true),
        sentAt: index,
      }),
    ),
    view({
      id: 'doc',
      kind: 'attachment',
      text: attachment('document.pdf', 'application/pdf', false),
      sentAt: 0,
    }),
    view({
      id: 'link',
      kind: 'text',
      text: 'https://example.com/shared https://example.com/another',
      sentAt: 0,
    }),
  ];
  catalogue.subscribe(() => {
    if (catalogue.count() !== null) complete.resolve();
  });
  catalogue.prepare('conversation', () => ({
    page: (before) => {
      pages.push(before);
      const offset = before === null ? 0 : 100 - before;
      return Promise.resolve({
        views: records.slice(offset, offset + 16),
        next: offset + 16 < records.length ? 100 - offset - 16 : null,
      });
    },
    media: (row) => {
      media.push(row.id);
      return preview.promise.then((bytes) => Uint8Array.from(bytes));
    },
    close: () => {},
  }));
  assert.equal(
    catalogue.count(),
    null,
    'an incomplete catalogue cannot claim zero',
  );
  await complete.promise;
  assert.equal(catalogue.count(), 39);
  assert.equal(galleryItems(catalogue.views()).media.length, 36);
  assert.equal(galleryItems(catalogue.views()).docs.length, 1);
  assert.equal(galleryItems(catalogue.views()).links.length, 2);
  assert.deepEqual(pages, [null, 84, 68]);
  assert.equal(
    media.length,
    2,
    'slow preview IO has a separate concurrency bound',
  );
  preview.resolve(Uint8Array.of(1, 2, 3));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const entry = galleryItems(catalogue.views()).media[0]!;
  await catalogue.picture(entry);
  const downloaded = media.length;
  await catalogue.picture(entry);
  assert.equal(
    media.length,
    downloaded,
    'opening a prepared tile reuses its preview',
  );
  assert.equal(
    media.includes('doc'),
    false,
    'listing docs needs no original bytes',
  );
  assert.ok(
    media.length <= 25,
    'at most 24 warm thumbnails plus one visible request',
  );
});

await test('verified visible pictures paint while the older catalogue page and optional cache write are pending', async (t) => {
  const catalogue = new MediaCatalogue<Row>();
  t.after(() => catalogue.clear());
  const lastPage = deferred<{ views: DailyView<Row>[]; next: null }>();
  const save = deferred<void>();
  const row = view({
    id: 'first',
    kind: 'attachment',
    text: attachment('p.jpg', 'image/jpeg', true),
    sentAt: 1,
  });
  let reads = 0;
  catalogue.prepare(
    'conversation',
    () => ({
      page: (before) =>
        before === null
          ? Promise.resolve({ views: [row], next: 16 })
          : lastPage.promise,
      media: () => {
        reads++;
        return Promise.resolve(Uint8Array.of(1, 2, 3));
      },
      previews: () => ({
        read: () => Promise.resolve(null),
        save: () => save.promise,
      }),
      close() {},
    }),
    { conversation: 'peer', rows: [row] },
  );
  const entry = galleryItems(catalogue.views()).media[0]!;
  const picture = await catalogue.picture(entry);
  assert.deepEqual(picture, Uint8Array.of(1, 2, 3));
  assert.equal(catalogue.count(), null);
  assert.equal(reads, 1, 'visible and background requests coalesce');
  save.resolve();
  lastPage.resolve({ views: [], next: null });
});

await test('a verified catalogue and encrypted previews can supply a reopening without rereading history or media', async (t) => {
  const catalogue = new MediaCatalogue<Row>();
  t.after(() => catalogue.clear());
  const row = view({
    id: 'cached',
    kind: 'attachment',
    text: attachment('p.jpg', 'image/jpeg', true),
    sentAt: 1,
  });
  catalogue.prepare('cached', () => ({
    checkpoint: {
      read: () => Promise.resolve([row]),
      save: () => Promise.resolve(),
    },
    page: () => assert.fail('A verified cache hit should avoid the scan'),
    media: () =>
      assert.fail('The encrypted preview should avoid the original download'),
    previews: () => ({
      read: () => Promise.resolve(Uint8Array.of(3, 2, 1)),
      save: () => Promise.resolve(),
    }),
    close() {},
  }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(catalogue.count(), 1);
  const entry = galleryItems(catalogue.views()).media[0]!;
  assert.deepEqual(await catalogue.picture(entry), Uint8Array.of(3, 2, 1));
  assert.equal(catalogue.error, null);
});

await test('a legacy video tile uses a saved still if available and never requests the original', async (t) => {
  const catalogue = new MediaCatalogue<Row>();
  t.after(() => catalogue.clear());
  const old = view({
    id: 'old-video',
    kind: 'attachment',
    text: attachment('old.mp4', 'video/mp4', false),
    sentAt: 1,
  });
  let saved: Uint8Array<ArrayBuffer> | null = null;
  let downloads = 0;
  catalogue.prepare(
    'legacy-video',
    () => ({
      page: () => Promise.resolve({ views: [old], next: null }),
      media: () => {
        downloads++;
        return Promise.resolve(Uint8Array.of(1));
      },
      previews: () => ({
        read: () => Promise.resolve(saved),
        save: () => Promise.resolve(),
      }),
      close() {},
    }),
    { conversation: 'peer', rows: [old] },
  );
  const tile = galleryItems(catalogue.views()).media[0]!;
  assert.equal(await catalogue.picture(tile), null);
  saved = Uint8Array.of(3, 1);
  assert.deepEqual(await catalogue.picture(tile), saved);
  assert.equal(downloads, 0);
});

await test('closing or replacing a catalogue suppresses late metadata and releases its reader', async () => {
  const catalogue = new MediaCatalogue<Row>();
  const page = deferred<{ views: DailyView<Row>[]; next: null }>();
  let closed = 0;
  catalogue.prepare('old', () => ({
    page: () => page.promise,
    media: () => Promise.resolve(null),
    close: () => closed++,
  }));
  catalogue.clear();
  page.resolve({
    views: [
      view({
        id: 'old',
        kind: 'text',
        text: 'https://private.example',
        sentAt: 0,
      }),
    ],
    next: null,
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(closed, 1);
  assert.deepEqual(catalogue.views(), []);
  assert.equal(catalogue.count(), null);
});

await test('scrolling the chat to older rows does not invalidate its prepared media catalogue', () => {
  const rows = Array.from({ length: 40 }, (_, index) =>
    view({
      id: String(index),
      kind: 'text',
      text: 'text ' + index,
      sentAt: index,
    }),
  );
  assert.equal(
    catalogueIdentity('peer', rows.slice(-16)),
    catalogueIdentity('peer', rows),
  );
  assert.notEqual(
    catalogueIdentity('peer', rows),
    catalogueIdentity('other', rows),
  );
});

await test('verified arrivals update the catalogue without discarding prepared content, while deletion rebuilds it', async (t) => {
  const catalogue = new MediaCatalogue<Row>();
  t.after(() => catalogue.clear());
  const first = {
    ...view({
      id: 'first',
      kind: 'text',
      text: 'https://example.com/first',
      sentAt: 1,
    }),
    sequence: 1,
  };
  const arrival = {
    ...view({
      id: 'arrival',
      kind: 'text',
      text: 'https://example.com/next',
      sentAt: 2,
    }),
    sequence: 2,
  };
  const document = {
    ...view({
      id: 'document',
      kind: 'attachment',
      text: attachment('document.pdf', 'application/pdf', false),
      sentAt: 0,
    }),
    sequence: 0,
  };
  let creations = 0;
  const source = () => {
    creations++;
    return {
      page: () => Promise.resolve({ views: [document, first], next: null }),
      media: () => assert.fail('Document metadata is enough for the list'),
      close() {},
    };
  };
  catalogue.prepare('initial', source, {
    conversation: 'peer',
    rows: [document, first],
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(catalogue.count(), 2);
  catalogue.prepare('appended', source, {
    conversation: 'peer',
    rows: [document, first, arrival],
  });
  assert.equal(catalogue.count(), 3);
  assert.equal(creations, 1);
  catalogue.prepare(
    'removed',
    () => {
      creations++;
      return {
        page: () => Promise.resolve({ views: [arrival], next: null }),
        media: () => Promise.resolve(null),
        close() {},
      };
    },
    { conversation: 'peer', rows: [arrival] },
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(creations, 2);
  assert.equal(catalogue.count(), 1);
});

await test('the gallery fills short tabs, paginates near the bottom and discards a page after closing', async (t) => {
  let frame: FrameRequestCallback | undefined;
  const setFrame = (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  };
  const globals = {
    requestAnimationFrame: setFrame,
    cancelAnimationFrame: () => {
      frame = undefined;
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  const body = Object.assign(new EventTarget(), {
    ownerDocument: Object.assign(new EventTarget(), {
      visibilityState: 'visible',
    }),
    clientHeight: 400,
    scrollHeight: 400,
    scrollTop: 0,
  });
  const notice = { textContent: '' };
  const abort = new AbortController();
  const first = deferred<boolean>();
  const next = deferred<boolean>();
  let reads = 0;
  let paints = 0;
  const tick = async () => {
    const callback = frame;
    frame = undefined;
    callback?.(0);
    await Promise.resolve();
  };
  watchGalleryHistory({
    body: body as unknown as HTMLElement,
    notice: notice as unknown as HTMLElement,
    older: {
      available: () => true,
      load: () => (++reads === 1 ? first.promise : next.promise),
    },
    repaint: () => {
      paints++;
      body.scrollHeight = 1200;
    },
    signal: abort.signal,
  });
  await tick();
  assert.equal(reads, 1);
  body.dispatchEvent(new Event('scroll'));
  await tick();
  assert.equal(reads, 1);
  first.resolve(true);
  await tick();
  await tick();
  assert.equal(paints, 1);
  assert.equal(reads, 1);
  body.scrollTop = 700;
  body.dispatchEvent(new Event('scroll'));
  await tick();
  assert.equal(reads, 2);
  abort.abort();
  next.resolve(true);
  await tick();
  assert.equal(paints, 1);
});
