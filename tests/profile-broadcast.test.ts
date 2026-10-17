import assert from 'node:assert/strict';
import test from 'node:test';
import { ProfileBroadcast } from '../src/client/messages/profile-broadcast.ts';
import type { ProfileCard } from '../src/client/message-profile/index.ts';

function setup(options: { fail?: string | undefined } = {}) {
  let card: ProfileCard = { name: 'Ana', revision: 1, photo: null };
  let peers = ['b', 'a'];
  const sent: string[] = [];
  const broadcast = new ProfileBroadcast({
    card: () => card,
    peers: () => peers,
    share: (peer, value) => {
      if (peer === options.fail) {
        options.fail = undefined;
        return Promise.reject(new Error('offline'));
      }
      sent.push(`${peer}@${value.revision}`);
      return Promise.resolve();
    },
    ready: () => true,
  });
  return {
    broadcast,
    sent,
    setCard: (value: ProfileCard) => (card = value),
    setPeers: (value: string[]) => (peers = value),
  };
}

await test('a new card reaches every confirmed contact once', async () => {
  const s = setup();
  await s.broadcast.run();
  await s.broadcast.run();
  assert.deepEqual(s.sent, ['a@1', 'b@1']);
  s.setCard({ name: 'Ana', revision: 2, photo: null });
  await s.broadcast.run();
  assert.deepEqual(s.sent, ['a@1', 'b@1', 'a@2', 'b@2']);
  s.setPeers(['a', 'b', 'c']);
  await s.broadcast.run();
  assert.deepEqual(s.sent.slice(4), ['a@2', 'b@2', 'c@2']);
});

await test('a failed round is retried by the next trigger', async () => {
  const s = setup({ fail: 'b' });
  await assert.rejects(s.broadcast.run());
  assert.deepEqual(s.sent, ['a@1']);
  await s.broadcast.run();
  assert.deepEqual(s.sent, ['a@1', 'a@1', 'b@1']);
});

await test('rounds never overlap', async () => {
  const s = setup();
  await Promise.all([s.broadcast.run(), s.broadcast.run()]);
  assert.deepEqual(s.sent, ['a@1', 'b@1']);
});
