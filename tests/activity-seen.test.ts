import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActivitySeen } from '../src/client/activity/seen.ts';
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
await test('entering the inbox acknowledges IDs without opening items; new IDs stay new after leaving', () => {
  const data = storage(),
    seen = new ActivitySeen(data);
  seen.setAccount('a');
  const unopened = { id: 'post:1', read: false };
  assert.equal(seen.count([unopened.id]), 1);
  seen.view([unopened.id]);
  assert.equal(seen.count([unopened.id]), 0);
  assert.equal(unopened.read, false);
  assert.equal(seen.count([unopened.id, 'post:2']), 1);
  const reload = new ActivitySeen(data);
  reload.setAccount('a');
  assert.equal(reload.count([unopened.id, 'post:2']), 1);
});
await test('seen state is account-specific and a changed status or ID remains new', () => {
  const data = storage(),
    seen = new ActivitySeen(data);
  seen.setSession({ accountId: 'a' });
  seen.view(['moderation:1:held']);
  seen.setAccount('b');
  assert.equal(seen.count(['moderation:1:held']), 1);
  seen.setAccount('a');
  assert.equal(seen.count(['moderation:1:held', 'moderation:1:rejected']), 1);
  seen.setAccount(null);
  assert.equal(seen.count(['moderation:1:held']), 1);
});
await test('blocked storage still allows acknowledgment during this visit and rejects unbounded data', () => {
  const seen = new ActivitySeen({
    getItem: () => {
      throw new Error('bloqueado');
    },
    setItem: () => {
      throw new Error('bloqueado');
    },
  });
  seen.setAccount('a');
  seen.view(['p:1']);
  assert.equal(seen.count(['p:1']), 0);
  const data = storage();
  data.values.set('0xdmme:activity-seen:a', JSON.stringify(['x'.repeat(161)]));
  const invalid = new ActivitySeen(data);
  invalid.setAccount('a');
  assert.equal(invalid.count(['p:1']), 1);
  invalid.view(Array.from({ length: 550 }, (_, i) => 'p:' + i));
  const stored: unknown = JSON.parse(data.getItem('0xdmme:activity-seen:a')!);
  assert.ok(Array.isArray(stored));
  assert.equal(stored.length, 512);
});
