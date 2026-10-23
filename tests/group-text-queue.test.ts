import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupTextQueue } from '../src/client/groups/text-queue.ts';
import { GroupReconciliation } from '../src/client/groups/reconciliation.ts';
import { GroupOutgoing } from '../src/client/groups/outgoing.ts';
import { deferred } from './fixtures/deferred.ts';

const settle = async (turns = 3) => {
  for (let n = 0; n < turns; n++)
    await new Promise<void>((resolve) => setImmediate(resolve));
};
function queue(send: (groupId: string) => Promise<boolean>) {
  const saved: { groupId: string; id: string; order: number }[] = [],
    sent: string[] = [];
  const subject = groupTextQueue({
    save: (groupId, draft) => {
      saved.push({ groupId, id: draft.id, order: draft.order });
      return Promise.resolve();
    },
    send,
    sent: (groupId) => sent.push(groupId),
    available: () => true,
    changed: () => {},
    failed: () => {},
  });
  return { subject, saved, sent };
}

await test('a burst keeps queue IDs and admission order, and each group is sent once per transmission', async () => {
  const sends: string[] = [];
  const { subject, saved, sent } = queue((groupId) => {
    sends.push(groupId);
    return Promise.resolve(true);
  });
  const ids = Array.from({ length: 10 }, () => crypto.randomUUID());
  ids.forEach((id, n) =>
    subject.enqueue({
      id,
      peer: n < 7 ? 'group-a' : 'group-b',
      text: `text ${n}`,
      createdAt: 1_000,
    }),
  );
  await settle(30);
  assert.deepEqual(
    saved.map((row) => row.id),
    ids,
  );
  for (let n = 1; n < saved.length; n++)
    assert.ok(saved[n]!.order > saved[n - 1]!.order, 'Strictly FIFO');
  assert.ok(sends.length <= saved.length, 'Never more sends than texts');
  assert.deepEqual([...new Set(sends)].sort(), ['group-a', 'group-b']);
  assert.deepEqual([...new Set(sent)].sort(), ['group-a', 'group-b']);
});

await test('the next transmission does not wait for the previous readback', async () => {
  const gates: ReturnType<typeof deferred<void>>[] = [];
  const { subject, sent } = queue(async () => {
    const gate = deferred<void>();
    gates.push(gate);
    await gate.promise;
    return true;
  });
  subject.enqueue({ id: crypto.randomUUID(), peer: 'g', text: 'one' });
  await settle();
  subject.enqueue({ id: crypto.randomUUID(), peer: 'g', text: 'two' });
  await settle();
  assert.equal(gates.length, 1);
  gates[0]!.resolve();
  await settle();
  // Accepted: the readback is only requested, and the next send starts.
  assert.deepEqual(sent, ['g']);
  assert.equal(gates.length, 2);
  gates[1]!.resolve();
  await settle();
  assert.deepEqual(sent, ['g', 'g']);
});

await test('a send that did not run keeps its group unsent for the retry', async () => {
  let ok = false;
  const { subject, sent } = queue(() => Promise.resolve(ok));
  subject.enqueue({ id: crypto.randomUUID(), peer: 'g', text: 'kept' });
  await settle();
  assert.deepEqual(sent, []);
  ok = true;
  subject.retry();
  await settle();
  assert.deepEqual(sent, ['g']);
});

await test('readback requests during a read cost exactly one more read and never overlap', async () => {
  const gates: ReturnType<typeof deferred<void>>[] = [];
  let active = 0,
    maximum = 0;
  const owner = new GroupReconciliation(async () => {
    active++;
    maximum = Math.max(maximum, active);
    const gate = deferred<void>();
    gates.push(gate);
    await gate.promise;
    active--;
  });
  const first = owner.request('g'),
    during = [owner.request('g'), owner.request('g')];
  await settle();
  assert.equal(gates.length, 1);
  gates[0]!.resolve();
  await settle();
  assert.equal(gates.length, 2, 'One more read covers both late requests');
  gates[1]!.resolve();
  await Promise.all([first, ...during]);
  assert.equal(maximum, 1);
  const next = owner.request('g');
  await settle();
  assert.equal(gates.length, 3, 'A later request reads again');
  gates[2]!.resolve();
  await next;
});

await test('pending texts show only in their group until the verified history has them', () => {
  const outgoing = new GroupOutgoing(),
    a = crypto.randomUUID(),
    b = crypto.randomUUID();
  outgoing.update({ id: a, peer: 'g1', text: 'one', createdAt: 1 }, 'admitted');
  outgoing.update({ id: b, peer: 'g2', text: 'two', createdAt: 2 }, 'admitted');
  assert.deepEqual(
    outgoing.rows('g1', new Set()).map((row) => row.id),
    [a],
  );
  outgoing.update({ id: a, peer: 'g1', text: 'one' }, 'save-failed');
  assert.equal(outgoing.rows('g1', new Set())[0]?.failed, true);
  assert.deepEqual(outgoing.rows('g1', new Set([a])), []);
  assert.deepEqual(
    outgoing.rows('g2', new Set()).map((row) => row.id),
    [b],
  );
});
