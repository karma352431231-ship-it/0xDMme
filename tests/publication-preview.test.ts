import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PublicationPreview } from '../src/client/activity/publication-preview.ts';
import { ExternalMediaConsent } from '../src/client/external-media/index.ts';
import { communityDocument } from './fixtures/community-dom.ts';

await test('notification previews render known GIFs separately and preserve ordinary text and unknown URLs', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: communityDocument(),
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const privacy = new ExternalMediaConsent({
    profile: () => Promise.resolve(false),
    storage: null,
  });
  const preview = new PublicationPreview(privacy);
  t.after(() => preview.clear());
  const gif = 'https://static.klipy.com/ii/synthetic/notification.gif';
  const text = `Caption\n${gif}\nhttps://unknown.invalid/animation.gif`;
  const node = preview.text(text);
  assert.equal(node.className, 'activity-quote activity-quote-media');
  assert.equal(node.querySelectorAll('.external-gif').length, 1);
  assert.equal(
    node.querySelector('.activity-quote')?.textContent,
    'Caption\n\nhttps://unknown.invalid/animation.gif',
  );
  const plain = preview.text('Only a short excerpt');
  assert.equal(plain.textContent, 'Only a short excerpt');
  assert.equal(plain.className, 'activity-quote');
  const hidden = preview.quote(
    { text: gif, status: 'removed', media: false },
    'reply',
  );
  assert.ok(typeof hidden === 'string');
  assert.ok(!hidden.includes(gif));
  preview.clear();
  assert.equal(node.querySelectorAll('.external-media-gate').length, 0);
});
