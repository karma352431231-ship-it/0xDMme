import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  moderationNotification,
  ModerationNotifications,
} from '../src/client/public-profile/moderation-notifications.ts';
import { PublicProfiles } from '../src/client/public-profile/controller.ts';
import type { PublicModerationNotice } from '../src/shared/public-moderation/index.ts';
const notice: PublicModerationNotice = {
  id: crypto.randomUUID(),
  target: crypto.randomUUID(),
  kind: 'post-media',
  status: 'rejected',
  createdAt: '2026-10-11T00:00:00Z',
  expiresAt: '2026-10-18T00:00:00Z',
  appeal: null,
  decision: null,
};
function controller(): PublicProfiles {
  return new PublicProfiles({
    withVault: () => Promise.reject(new Error('Não usado')),
    withLocalVault: () => Promise.reject(new Error('Não usado')),
  });
}
await test('notice explains removal and distinguishes failure or uncertainty from rejection; success and waiting never accuse the author', () => {
  const refused = moderationNotification(notice);
  assert.match(refused!.title, /removed from public view/u);
  assert.match(refused!.reason, /detected explicit content/u);
  for (const status of ['approved', 'pending', 'analyzing', 'removed'] as const)
    assert.equal(moderationNotification({ ...notice, status }), null);
  assert.match(
    moderationNotification({ ...notice, status: 'failed' })!.reason,
    /Could not safely complete analysis/u,
  );
  assert.match(
    moderationNotification({ ...notice, status: 'held' })!.reason,
    /uncertain/u,
  );
});
await test('notice read is device- and account-specific and a status change creates a new notice', async (t) => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const source = controller();
  const request = t.mock.method(source, 'perform', () =>
    Promise.resolve([notice]),
  );
  const notifications = new ModerationNotifications(source, storage);
  notifications.setAccount('a');
  const first = await notifications.read();
  notifications.markRead(first.map((item) => item.id));
  assert.equal((await notifications.read())[0]?.read, true);
  notifications.setAccount('b');
  assert.equal((await notifications.read())[0]?.read, false);
  notifications.setAccount('a');
  assert.equal((await notifications.read())[0]?.read, true);
  request.mock.mockImplementation(() =>
    Promise.resolve([{ ...notice, status: 'expired' }]),
  );
  assert.equal((await notifications.read())[0]?.read, false);
});
await test("previous account's moderation response cannot reappear after session change", async (t) => {
  const source = controller();
  let finish: (value: unknown) => void = () => undefined;
  t.mock.method(
    source,
    'perform',
    () =>
      new Promise<unknown>((resolve) => {
        finish = resolve;
      }),
  );
  const notifications = new ModerationNotifications(source);
  notifications.setAccount('a');
  const pending = notifications.read();
  notifications.setAccount('b');
  finish([notice]);
  assert.deepEqual(await pending, []);
});
