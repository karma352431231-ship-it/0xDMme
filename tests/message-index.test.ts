import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageIndex } from '../src/client/messages/index-sync.ts';

const sender = crypto.randomUUID(),
  recipient = crypto.randomUUID();
function row(sequence: number, deleted = false) {
  return {
    kind: 'text',
    id: crypto.randomUUID(),
    sender,
    recipient,
    sequence,
    hash: 'a'.repeat(64),
    deleted,
    deletion: null,
    sender_revision: 1,
    recipient_revision: 1,
    queue_active: true,
    status: 'pending',
  };
}
await test('rodadas limitadas continuam o mesmo snapshot sem liberar índice parcial; alteração reinicia', async () => {
  const index = new MessageIndex();
  const rows = Array.from({ length: 144 }, (_, i) => row(i + 1, i === 16));
  const checked: number[] = [];
  const read = (_operation: string, payload: Record<string, unknown>) => {
    const after = Number(payload['after']);
    return Promise.resolve({
      items: rows.slice(after, after + 16),
      next: after + 16 < rows.length ? after + 16 : null,
    });
  };
  const context = {
    snapshot: { revision: 1 },
    selected: recipient,
    before: null,
    api: read,
    deleted: (item: { sequence: number }) => {
      checked.push(item.sequence);
      return Promise.resolve();
    },
  };
  await assert.rejects(index.read(context), /parcialmente/);
  assert.deepEqual(checked, [17]);
  const complete = await index.read(context);
  assert.deepEqual(
    complete.map((item) => item.sequence),
    Array.from({ length: 16 }, (_, i) => i + 129),
  );
  await assert.rejects(
    index.read({ ...context, snapshot: { revision: 2 } }),
    /parcialmente/,
  );
  assert.deepEqual(checked, [17, 17]);
});
await test('índice adulterado não avança; foto excluída não faz reaparecer uma versão anterior', async () => {
  const index = new MessageIndex();
  const profile = { ...row(1), kind: 'profile' };
  const gone = { ...row(2, true), kind: 'profile' };
  const context = {
    snapshot: {},
    selected: recipient,
    before: null,
    deleted: async () => {},
  };
  assert.deepEqual(
    await index.read({
      ...context,
      api: () => Promise.resolve({ items: [profile, gone], next: null }),
    }),
    [],
  );
  index.reset();
  await assert.rejects(
    index.read({
      ...context,
      api: () => Promise.resolve({ items: [profile], next: 2 }),
    }),
    /Paginação/,
  );
});
