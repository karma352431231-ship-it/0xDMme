import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConversationActivity } from '../src/client/messages/activity.ts';
import type { PeerState } from '../src/client/daily/index.ts';
import { deferred } from './fixtures/deferred.ts';

function fixture(readVisible = () => Promise.resolve()) {
  const state = { generation: 0, alerts: 0, reads: 0, mute: 0 };
  let values = new Map<string, PeerState>([
    [
      'peer',
      { revision: 1, mutedUntil: 0, unread: 1, online: false, lastSeen: null },
    ],
  ]);
  const read = deferred<Map<string, PeerState>>();
  const activity = new ConversationActivity({
    generation: () => state.generation,
    current: (generation) => generation === state.generation,
    peers: () => [{ id: 'peer', settings: 'saved-peer' }],
    readVisible,
    previous: () => values,
    publish: (next) => {
      values = next;
    },
    alert: () => {
      state.alerts++;
    },
    daily: {
      states: () => {
        state.reads++;
        return read.promise;
      },
      keepArchivedSilent: (_peer, _settings, next) =>
        Promise.resolve({ ...next, mutedUntil: state.mute }),
    },
  });
  const next = () => new Map([['peer', { ...values.get('peer')!, unread: 2 }]]);
  return { activity, state, read, values: () => values, next };
}
await test('an authorized unread update publishes its badge and sound together without maintenance', async () => {
  const f = fixture(),
    work = f.activity.refresh();
  assert.equal(f.values().get('peer')?.unread, 1);
  assert.equal(f.state.alerts, 0);
  f.read.resolve(f.next());
  await work;
  assert.equal(f.values().get('peer')?.unread, 2);
  assert.equal(f.state.alerts, 1);
});
await test('session replacement discards old unread counts and sound', async () => {
  let acknowledgements = 0;
  const f = fixture(() => {
      acknowledgements++;
      return Promise.resolve();
    }),
    work = f.activity.refresh();
  f.state.generation++;
  f.read.resolve(f.next());
  await work;
  assert.equal(f.values().get('peer')?.unread, 1);
  assert.equal(f.state.alerts, 0);
  assert.equal(acknowledgements, 0);
});
await test('an incoming message sounds before visible acknowledgement can clear its unread count', async () => {
  const visible = deferred<void>(),
    f = fixture(() => {
      assert.equal(f.values().get('peer')?.unread, 2);
      assert.equal(f.state.alerts, 1);
      return visible.promise;
    }),
    work = f.activity.refresh();
  f.read.resolve(f.next());
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.state.alerts, 1);
  visible.resolve();
  await work;
  assert.equal(f.state.reads, 1);
});
await test('archive mute is enforced before an unread increase can sound', async () => {
  const f = fixture(),
    work = f.activity.refresh();
  f.state.mute = Number.MAX_SAFE_INTEGER;
  f.read.resolve(f.next());
  await work;
  assert.equal(f.values().get('peer')?.unread, 2);
  assert.equal(f.state.alerts, 0);
});
await test('coalesced unread refreshes never duplicate a sound for the same count', async () => {
  const f = fixture(),
    first = f.activity.refresh(),
    second = f.activity.refresh();
  f.read.resolve(f.next());
  await Promise.all([first, second]);
  assert.equal(f.state.reads, 2);
  assert.equal(f.state.alerts, 1);
});
