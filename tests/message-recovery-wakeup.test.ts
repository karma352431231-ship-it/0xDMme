import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageRecoveryWakeup } from '../src/client/messages/recovery-wakeup.ts';
import type { PendingConversation } from '../src/client/messages/sync-progress.ts';
const pending = (retryAt: number): PendingConversation => ({
  peer: crypto.randomUUID(),
  after: 0,
  through: 1,
  required: 1,
  reason: 'key',
  retryAt,
});
await test('one recovery alarm requests fair work without a polling loop and cancels on departure', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let wakes = 0;
  const alarm = new MessageRecoveryWakeup(() => wakes++);
  alarm.wait([pending(Date.now() + 30000), pending(Date.now() + 40000)]);
  t.mock.timers.tick(29999);
  assert.equal(wakes, 0);
  t.mock.timers.tick(1);
  assert.equal(wakes, 1);
  alarm.wait([pending(Date.now() + 30000)]);
  alarm.clear();
  t.mock.timers.tick(60000);
  assert.equal(wakes, 1);
  alarm.wait([pending(0)]);
  t.mock.timers.tick(1);
  assert.equal(wakes, 1, 'already runnable work belongs to the active inbox');
});
