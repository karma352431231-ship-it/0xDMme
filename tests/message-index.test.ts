import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageIndex } from '../src/client/messages/index-sync.ts';

const sender = crypto.randomUUID(),
  recipient = crypto.randomUUID();
function row(sequence: number, deleted = false) {
  return {
    kind: 'text' as const,
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
    account: sender,
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
    account: sender,
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

await test('navegação reutiliza um índice completo de todas as conversas; alterações e exclusões exigem conferência atual', async () => {
  const index = new MessageIndex(),
    other = crypto.randomUUID();
  const rows = Array.from({ length: 40 }, (_, i) => ({
    ...row(i + 1, i === 3),
    recipient: i % 2 ? other : recipient,
  }));
  let pages = 0;
  const removed: number[] = [];
  const context = {
    account: sender,
    snapshot: { revision: 1 },
    selected: recipient,
    before: null,
    deleted: (item: { sequence: number }) => {
      removed.push(item.sequence);
      return Promise.resolve();
    },
    api: (_op: string, payload: Record<string, unknown>) => {
      pages++;
      const after = Number(payload['after']);
      return Promise.resolve({
        items: rows.slice(after, after + 16),
        next: after + 16 < rows.length ? after + 16 : null,
      });
    },
  };
  assert.equal((await index.read(context)).length, 16);
  assert.deepEqual(removed, [4]);
  assert.equal(pages, 3);
  const next = await index.read({ ...context, selected: other });
  assert.equal(pages, 3);
  assert.deepEqual(
    next.map((item) => item.sequence),
    Array.from({ length: 16 }, (_, i) => 10 + i * 2),
  );
  await index.read({ ...context, selected: other, snapshot: { revision: 2 } });
  assert.equal(pages, 6);
  assert.deepEqual(removed, [4, 4]);
  await assert.rejects(
    new MessageIndex().read({ ...context, account: crypto.randomUUID() }),
    /fora da conta/,
  );
});

await test('catálogo que excede seu orçamento refaz a conferência da nova conversa sem devolver janela incompleta', async () => {
  const index = new MessageIndex(),
    ids = Array.from({ length: 270 }, () => crypto.randomUUID());
  const rows = Array.from({ length: 4320 }, (_, i) => ({
    ...row(i + 1),
    recipient: ids[i % ids.length]!,
  }));
  let pages = 0;
  const context = {
    account: sender,
    snapshot: { revision: 1 },
    selected: ids[0]!,
    before: null,
    deleted: async () => {},
    api: (_op: string, payload: Record<string, unknown>) => {
      pages++;
      const after = Number(payload['after']);
      return Promise.resolve({
        items: rows.slice(after, after + 16),
        next: after + 16 < rows.length ? after + 16 : null,
      });
    },
  };
  async function complete(selected: string) {
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        return await index.read({ ...context, selected });
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes('parcialmente')
        )
          throw error;
      }
    }
    throw new Error('Índice não terminou.');
  }
  assert.equal((await complete(ids[0]!)).length, 16);
  const before = pages;
  assert.equal((await complete(ids[1]!)).length, 16);
  assert.equal(pages - before, 270);
});

await test('preparação confirmada deixa todas as janelas prontas sem refazer páginas ao abri-las', async () => {
  const index = new MessageIndex(),
    other = crypto.randomUUID();
  const rows = Array.from({ length: 24 }, (_, i) => ({
    ...row(i + 1),
    recipient: i % 2 ? other : recipient,
    status: 'received' as const,
  }));
  const snapshot = { revision: 1 };
  index.rememberConfirmedPage({
    snapshot,
    account: sender,
    selected: null,
    after: 0,
    page: { items: rows.slice(0, 16), next: 16 },
  });
  index.rememberConfirmedPage({
    snapshot,
    account: sender,
    selected: null,
    after: 16,
    page: { items: rows.slice(16), next: null },
  });
  for (const selected of [recipient, other]) {
    const window = await index.read({
      snapshot,
      account: sender,
      selected,
      before: null,
      deleted: async () => {},
      api: () => Promise.reject(new Error('Não deve buscar índice novamente.')),
    });
    assert.equal(window.length, 12);
    assert.ok(window.every((item) => item.status === 'received'));
  }
});
