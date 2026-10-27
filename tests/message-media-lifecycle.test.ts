import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConversationReader } from '../src/client/messages/conversation-reader.ts';
import type { MessageView } from '../src/client/messages/message-view.ts';

function reader(): ConversationReader {
  const unavailable = () => Promise.reject(new Error('Unexpected transport.'));
  return new ConversationReader({
    access: { withVault: unavailable, withLocalVault: unavailable },
    authority: {
      session: () => null,
      current: () => 0,
      guard() {},
      savePins: () => Promise.resolve(),
    },
    packets: {
      cached: () => Promise.resolve(null),
      missing: () => Promise.resolve(new Map()),
      remove: () => Promise.resolve(),
      offlineProfiles: () => Promise.resolve([]),
    },
    publish() {},
    events: {},
  });
}
function attachment(archived: boolean): MessageView {
  return {
    id: crypto.randomUUID(),
    peer: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    kind: 'attachment',
    own: true,
    text: '',
    state: '',
    archived,
  };
}
await test('imported media does not require a remote message in the current window', (t) => {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  t.after(() => Reflect.deleteProperty(globalThis.navigator, 'onLine'));
  const selected = reader();
  const imported = selected.captureMedia(attachment(true));
  assert.doesNotThrow(imported.guard);
  assert.equal(imported.snapshot(), null);
  assert.throws(
    selected.captureMedia(attachment(false)).guard,
    /Sync before opening the attachment/u,
  );
});
await test('changing the conversation or closing the reader invalidates imported media work', () => {
  const selected = reader();
  const beforeNavigation = selected.captureMedia(attachment(true));
  selected.select(crypto.randomUUID());
  assert.throws(beforeNavigation.guard, /Synchronization work interrupted/u);
  const beforeClose = selected.captureMedia(attachment(true));
  selected.close();
  assert.throws(beforeClose.guard, /Session changed/u);
});
