import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activityGroups,
  replyQuote,
  startActivity,
} from '../src/client/activity/index.ts';
import type { ActivitySources } from '../src/client/activity/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';

const session = { accountId: 'a', deviceId: 'd', csrf: 'c' } as AccountSession;
const peer = { accountId: 'p', name: 'Ana', address: '0x1', ecosystem: 'evm' };

function sources(overrides: Partial<ActivitySources> = {}): ActivitySources {
  return {
    requests: () => Promise.resolve([peer, { ...peer, accountId: 'q' }]),
    respondRequest: () => Promise.resolve(),
    groupInvites: () =>
      Promise.resolve([{ id: 'g', kind: 'invite' as const, actor: 'Caio' }]),
    respondGroupInvite: () => Promise.resolve(),
    replies: () =>
      Promise.resolve([
        {
          reply: 'r',
          community: 'c',
          createdAt: '2026-10-09T10:00:00Z',
          preview: null,
        },
      ]),
    markRepliesRead: () => Promise.resolve(),
    transfers: () => Promise.resolve([]),
    missedCalls: () => Promise.resolve([]),
    clearMissedCalls: () => Promise.resolve(),
    ...overrides,
  };
}

await test('contador soma pedidos, convites, respostas e transferências', async () => {
  const counts: number[] = [];
  const activity = startActivity(sources(), {
    countChanged: (count) => counts.push(count),
  });
  activity.setSession(session);
  await activity.refresh();
  assert.equal(counts.at(-1), 4);
});

await test('uma fonte com falha não esconde as demais', async () => {
  const counts: number[] = [];
  const activity = startActivity(
    sources({ requests: () => Promise.reject(new Error('Sem conexão')) }),
    { countChanged: (count) => counts.push(count) },
  );
  activity.setSession(session);
  await activity.refresh();
  assert.equal(counts.at(-1), 2);
});

await test('sem sessão nada é lido e trocar de conta zera o contador', async () => {
  let reads = 0;
  const counts: number[] = [];
  const activity = startActivity(
    sources({
      requests: () => {
        reads++;
        return Promise.resolve([peer]);
      },
    }),
    { countChanged: (count) => counts.push(count) },
  );
  await activity.refresh();
  assert.equal(reads, 0);
  activity.setSession(session);
  await activity.refresh();
  activity.setSession({ ...session, accountId: 'b' });
  assert.equal(counts.at(-1), 0);
});

await test('filtros: Pedidos reúne o que espera resposta e Respostas só as respostas das comunidades', () => {
  for (const [filter, groups] of [
    ['all', ['requests', 'calls', 'invites', 'replies', 'transfers']],
    ['requests', ['requests', 'invites', 'transfers']],
    ['replies', ['replies']],
  ] as const)
    assert.deepEqual(activityGroups(filter), groups);
});

await test('resposta aparece direto na Atividade; ocultas e excluídas não mostram texto', () => {
  for (const [preview, expected] of [
    [null, ''],
    [{ text: 'Concordo!', media: false, status: 'visible' }, 'Concordo!'],
    [{ text: '', media: true, status: 'visible' }, 'Enviou uma mídia.'],
    [
      { text: '', media: false, status: 'removed' },
      'Resposta ocultada pela moderação.',
    ],
    [
      { text: '', media: false, status: 'deleted' },
      'Resposta excluída pelo autor.',
    ],
  ] as const)
    assert.equal(replyQuote(preview), expected);
});
