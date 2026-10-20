import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConversationPreviewLoader } from '../src/client/conversation-preview/index.ts';
import { resumeFixture } from './fixtures/message-resume.ts';

await test('account preview verification survives rapid contact selections without clearing verified previews', async () => {
  const f = resumeFixture(),
    other = crypto.randomUUID();
  await f.add('Previously verified latest message');
  const previews = new ConversationPreviewLoader({
    load: (peers) => f.controller.directoryPreviews(peers),
    changed: () => {},
  });
  await previews.refresh([f.peer]);
  assert.equal(
    previews.values.get(f.peer)?.text,
    'Previously verified latest message',
  );
  f.data.beforeDelivery = () => {
    f.data.beforeDelivery = undefined;
    for (const peer of [other, f.peer, other, f.peer])
      f.controller.select(peer);
  };
  await previews.refresh([f.peer]);
  assert.equal(previews.failed, false);
  assert.equal(
    previews.values.get(f.peer)?.text,
    'Previously verified latest message',
  );
  assert.equal(f.data.requests.at(-1), 'confirm');
});

for (const boundary of [
  'pause',
  'removed',
  'hide',
  'close',
  'session',
  'disconnect',
] as const)
  await test(`account preview cannot publish across ${boundary}`, async () => {
    const f = resumeFixture();
    await f.add('Must not remain after an authorization boundary');
    const previews = new ConversationPreviewLoader({
      load: (peers) => f.controller.directoryPreviews(peers),
      changed: () => {},
    });
    await previews.refresh([f.peer]);
    assert.equal(previews.values.size, 1);
    f.data.beforeDelivery = () => {
      f.data.beforeDelivery = undefined;
      if (boundary === 'session')
        f.controller.setSession({ ...f.session, csrf: 'e'.repeat(64) });
      else if (boundary === 'disconnect') f.controller.setLiveConnected(false);
      else f.controller[boundary]();
    };
    await previews.refresh([f.peer]);
    assert.equal(previews.failed, true);
    assert.equal(previews.values.size, 0);
  });

await test('directory-only navigation retains account preview verification, while real authorization failure clears it', async () => {
  const f = resumeFixture();
  await f.add('Verified directory preview');
  const previews = new ConversationPreviewLoader({
    load: (peers) => f.controller.directoryPreviews(peers),
    changed: () => {},
  });
  await previews.refresh([f.peer]);
  f.data.beforeDelivery = () => {
    f.data.beforeDelivery = undefined;
    f.controller.pause('conversation');
  };
  await previews.refresh([f.peer]);
  assert.equal(previews.failed, false);
  assert.equal(previews.values.size, 1);
  f.data.failure = 'delivery';
  await previews.refresh([f.peer]);
  assert.equal(previews.failed, true);
  assert.equal(previews.values.size, 0);
});
