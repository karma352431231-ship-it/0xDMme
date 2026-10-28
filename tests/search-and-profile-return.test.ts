import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newestFirst } from '../src/client/messages/search-results.ts';
import {
  forgetProfileReturn,
  rememberProfileReturn,
  takeProfileReturn,
} from '../src/client/profile-shortcut/index.ts';

await test('search results merge pages newest first, unknown times last in found order', () => {
  const found = newestFirst([
    { id: '15', sentAt: 1500 },
    { id: 'old-a' },
    { id: '05', sentAt: 500 },
    { id: '17', sentAt: 1700 },
    { id: 'old-b' },
    { id: '13', sentAt: 1300 },
  ]);
  assert.deepEqual(
    found.map((item) => item.id),
    ['17', '15', '13', '05', 'old-a', 'old-b'],
  );
});

await test('a profile setup link leads back once, and leaving setup forgets it', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {
    value: { hash: '', pathname: '/communities/feed', search: '' },
    configurable: true,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'location', previous);
    else Reflect.deleteProperty(globalThis, 'location');
  });
  const link = new EventTarget() as unknown as HTMLAnchorElement;
  rememberProfileReturn(link);
  link.dispatchEvent(new Event('click'));
  assert.equal(takeProfileReturn(), '/communities/feed');
  assert.equal(takeProfileReturn(), null, 'the way back is used once');
  link.dispatchEvent(new Event('click'));
  forgetProfileReturn();
  assert.equal(takeProfileReturn(), null);
});
