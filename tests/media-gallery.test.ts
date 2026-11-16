import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  galleryItems,
  galleryCount,
  tileSource,
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
  // Videos and photos sent as originals have no thumbnail: their tile reads
  // the file, and a video shows its opening frame (regression, 12/11/2026).
  assert.deepEqual(items.media.map(tileSource), [
    { thumbnail: false, frameType: 'video/mp4' },
    { thumbnail: true, frameType: null },
  ]);
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
