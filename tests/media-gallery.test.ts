import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  galleryItems,
  galleryCount,
} from '../src/client/media-gallery/index.ts';
import type { DailyRow, DailyView } from '../src/client/daily-text/index.ts';

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
});
