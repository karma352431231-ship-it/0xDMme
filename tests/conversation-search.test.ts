import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchingConversations } from '../src/client/messages/directory.ts';
import { searchGroupCopies } from '../src/client/groups/search.ts';
import type { GroupView } from '../src/client/groups/reader.ts';

await test('busca de chats encontra nomes, wallets e grupos sem distinguir caixa; não altera a lista', () => {
  const entries = [
    {
      id: 'alice',
      title: 'Alice',
      detail: '',
      kind: 'contact' as const,
      searchText: 'Alice 0xAbCd',
      selected: false,
      open: () => undefined,
    },
    {
      id: 'group',
      title: 'Equipe',
      detail: '',
      kind: 'group' as const,
      searchText: 'Equipe',
      selected: false,
      open: () => undefined,
    },
  ];
  assert.deepEqual(
    matchingConversations(entries, '  ＡＬＩＣＥ  ').map((r) => r.id),
    ['alice'],
  );
  assert.deepEqual(
    matchingConversations(entries, '0xAB').map((r) => r.id),
    ['alice'],
  );
  assert.deepEqual(
    matchingConversations(entries, 'EQUIPE').map((r) => r.id),
    ['group'],
  );
  assert.equal(matchingConversations(entries, '').length, 2);
  assert.equal(entries.length, 2);
});

function view(sequence: number, text: string): GroupView {
  return {
    id: `message-${sequence}`,
    groupId: 'a',
    sequence,
    epoch: 1,
    hash: 'a'.repeat(64),
    sender: 'sender',
    own: false,
    kind: 'text',
    text,
    unavailableMedia: [],
  };
}
await test('pesquisa de grupos inclui legenda dos anexos e avança para outro grupo', async () => {
  const content = {
    version: 1,
    name: 'foto.jpg',
    type: 'image/jpeg',
    image: false,
    caption: 'Uma PALAVRA na legenda',
    thumbnail: null,
    file: {
      encryption: '{}',
      ref: {
        id: crypto.randomUUID(),
        hash: 'a'.repeat(64),
        bytes: 1,
        parts: [{ hash: 'a'.repeat(64), bytes: 1 }],
      },
    },
  };
  const result = await searchGroupCopies({
    query: 'palavra',
    after: null,
    groups: ['a', 'b'],
    guard: () => undefined,
    read: (group) =>
      Promise.resolve({
        views: [
          {
            ...view(1, JSON.stringify(content)),
            groupId: group,
            kind: 'attachment',
          },
        ],
        before: null,
      }),
  });
  assert.deepEqual(
    result.items.map((row) => row.peer),
    ['a', 'b'],
  );
  assert.match(result.items[0]!.excerpt, /PALAVRA na legenda/u);
  assert.equal(result.next, null);
});
await test('pesquisa de grupos limita cada rodada e continua sem perder o grupo ou página', async () => {
  const read = (_group: string, before: number | null) => {
    const sequence = before === null ? 100 : before - 1;
    return Promise.resolve({
      views: [view(sequence, 'Palavra')],
      before: sequence > 1 ? sequence : null,
    });
  };
  const context = {
    query: 'PALAVRA',
    groups: ['a'],
    guard: () => undefined,
    read,
  };
  const first = await searchGroupCopies({ ...context, after: null });
  assert.deepEqual(
    first.items.map((r) => r.sequence),
    [100, 99, 98, 97],
  );
  const second = await searchGroupCopies({ ...context, after: first.next });
  assert.deepEqual(
    second.items.map((r) => r.sequence),
    [96, 95, 94, 93],
  );
  const end = await searchGroupCopies({
    ...context,
    after: JSON.stringify({ group: 'a', before: 2 }),
  });
  assert.deepEqual(
    end.items.map((r) => r.sequence),
    [1],
  );
  assert.equal(end.next, null);
});
await test('pesquisa não publica conteúdo após mudança de sessão e recusa cursor de grupo ausente', async () => {
  let changed = false;
  const context = {
    query: 'palavra',
    groups: ['a'],
    after: null,
    guard: () => {
      if (changed) throw new Error('Sessão alterada');
    },
    read: () => {
      changed = true;
      return Promise.resolve({ views: [view(1, 'Palavra')], before: null });
    },
  };
  await assert.rejects(searchGroupCopies(context), /Sessão alterada/u);
  changed = false;
  await assert.rejects(
    searchGroupCopies({
      ...context,
      after: '{"group":"another","before":null}',
    }),
    /Grupo da busca mudou/u,
  );
  await assert.rejects(
    searchGroupCopies({ ...context, after: '{"group":"a","before":-1}' }),
    /Página de busca inválida/u,
  );
});
