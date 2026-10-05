import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  matchingConversations,
  filteredConversations,
} from '../src/client/messages/directory.ts';
import type { ConversationEntry } from '../src/client/messages/directory.ts';
import {
  HoldGesture,
  keepConversationMenu,
} from '../src/client/messages/directory-menu.ts';
import { searchGroupCopies } from '../src/client/groups/search.ts';
import type { GroupView } from '../src/client/groups/reader.ts';

await test('filtros separam arquivadas, favoritos, grupos e não lidas; fixadas ficam primeiro sem apagar o histórico pesquisável', () => {
  const entries: ConversationEntry[] = [
    {
      id: 'ordinary',
      title: 'Contato',
      detail: '',
      kind: 'contact',
      searchText: 'Contato',
      selected: false,
      open: () => undefined,
    },
    {
      id: 'group',
      title: 'Grupo',
      detail: '',
      kind: 'group',
      searchText: 'Grupo',
      selected: false,
      pinned: true,
      favorite: true,
      unread: 2,
      open: () => undefined,
    },
    {
      id: 'archive',
      title: 'Arquivada',
      detail: '',
      kind: 'contact',
      searchText: 'Arquivada',
      selected: false,
      archived: true,
      favorite: true,
      unread: 1,
      open: () => undefined,
    },
    {
      id: 'removed',
      title: 'Removido',
      detail: '',
      kind: 'contact',
      searchText: 'Removido',
      selected: false,
      hidden: true,
      open: () => undefined,
    },
  ];
  for (const [filter, expected] of [
    ['all', ['group', 'ordinary']],
    ['unread', ['group']],
    ['favorites', ['group']],
    ['groups', ['group']],
    ['archived', ['archive']],
  ] as const)
    assert.deepEqual(
      filteredConversations(entries, filter).map((entry) => entry.id),
      expected,
    );
  assert.equal(entries[0]?.id, 'ordinary');
  assert.equal(matchingConversations(entries, 'Removido')[0]?.id, 'removed');
});
await test('toque prolongado abre menu uma vez e consome o clique; rolagem, cancelamento e toque curto preservam a abertura normal', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let opened = 0;
  const gesture = new HoldGesture(() => {
    opened++;
  });
  gesture.start(10, 10);
  t.mock.timers.tick(499);
  assert.equal(opened, 0);
  t.mock.timers.tick(1);
  assert.equal(opened, 1);
  assert.equal(gesture.consumeClick(), true);
  assert.equal(gesture.consumeClick(), false);
  gesture.start(10, 10);
  gesture.move(10, 30);
  t.mock.timers.tick(600);
  assert.equal(opened, 1);
  assert.equal(gesture.consumeClick(), false);
  gesture.start(10, 10);
  gesture.cancel();
  t.mock.timers.tick(600);
  assert.equal(opened, 1);
});
await test('atualizar contadores preserva menu; contato removido, identidade ou ações alteradas invalidam as opções antigas', () => {
  const entry: ConversationEntry = {
    id: 'wallet',
    title: 'Contato',
    detail: '',
    kind: 'contact',
    searchText: '',
    selected: false,
    open: () => undefined,
    actions: [{ id: 'pin', label: 'Fixar', perform: () => undefined }],
  };
  assert.equal(
    keepConversationMenu(entry, [{ ...entry, unread: 5, selected: true }]),
    true,
  );
  assert.equal(
    keepConversationMenu(entry, [{ ...entry, hidden: true }]),
    false,
  );
  assert.equal(keepConversationMenu(entry, [{ ...entry, id: 'other' }]), false);
  assert.equal(
    keepConversationMenu(entry, [
      {
        ...entry,
        actions: [{ id: 'pin', label: 'Desafixar', perform: () => undefined }],
      },
    ]),
    false,
  );
});

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
