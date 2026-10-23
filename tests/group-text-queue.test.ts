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
/** `sent` lists the groups whose send ran and succeeded. */
function queue(send: (groupId: string) => Promise<boolean>) {
  const saved: { groupId: string; id: string; order: number }[] = [],
    sent: string[] = [];
  const subject = groupTextQueue({
    save: (groupId, draft) => {
      saved.push({ groupId, id: draft.id, order: draft.order });
      return Promise.resolve();
    },
    send: async (groupId) => {
      const ok = await send(groupId);
      if (ok) sent.push(groupId);
      return ok;
    },
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

await test('the next transmission starts once the previous one is accepted, with no readback between', async () => {
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
  // Accepted: nothing else runs before the next send starts.
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

await test('pending texts show only in their group and only while the shown history lacks them', () => {
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

await test('an accepted text stays shown without a readback until a verified read that started after acceptance settles it', () => {
  const outgoing = new GroupOutgoing(),
    kept = crypto.randomUUID(),
    removed = crypto.randomUUID(),
    unsent = crypto.randomUUID(),
    late = crypto.randomUUID();
  for (const [n, id] of [kept, removed, unsent, late].entries())
    outgoing.update({ id, peer: 'g', text: `t${n}`, createdAt: n }, 'admitted');
  outgoing.accepted(kept, 10, 'g');
  outgoing.accepted(removed, 10, 'g');
  outgoing.accepted(late, 30, 'g');
  assert.equal(outgoing.rows('g', new Set()).length, 4, 'No read needed');
  // A read that started at 20 has `kept`, lacks `removed` (deleted), cannot
  // know `late` (accepted after it started) and leaves the unsent text.
  assert.deepEqual(outgoing.verified('g', new Set([kept]), 20), {
    settled: [kept],
    retired: [removed],
  });
  assert.deepEqual(
    outgoing.rows('g', new Set()).map((row) => row.id),
    [unsent, late],
  );
  assert.deepEqual(outgoing.verified('other', new Set(), 99), {
    settled: [],
    retired: [],
  });
});

await test('accepted texts are bounded: a crowded open group asks for a readback, closed groups are dropped first', () => {
  const outgoing = new GroupOutgoing();
  const accept = (peer: string, open: string | null) => {
    const id = crypto.randomUUID();
    outgoing.update({ id, peer, text: 'x', createdAt: 1 }, 'admitted');
    outgoing.accepted(id, 1, open);
    return id;
  };
  for (let n = 0; n < 31; n++) accept('open', 'open');
  assert.equal(outgoing.crowded('open'), false);
  accept('open', 'open');
  assert.equal(outgoing.crowded('open'), true);
  const closed = Array.from({ length: 100 }, () => accept('closed', 'open'));
  assert.equal(outgoing.rows('open', new Set()).length, 32, 'Open group kept');
  assert.equal(outgoing.rows('closed', new Set()).length, 96);
  assert.equal(
    outgoing.rows('closed', new Set()).some((row) => row.id === closed[0]),
    false,
    'The oldest closed-group texts went first',
  );
});
