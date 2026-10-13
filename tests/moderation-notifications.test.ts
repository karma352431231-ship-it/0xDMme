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
await test('aviso explica a remoção e distingue falha/incerteza de recusa; sucesso e espera não acusam o autor', () => {
  const refused = moderationNotification(notice);
  assert.match(refused!.title, /retirada do público/u);
  assert.match(refused!.reason, /indicou conteúdo explícito/u);
  for (const status of ['approved', 'pending', 'analyzing', 'removed'] as const)
    assert.equal(moderationNotification({ ...notice, status }), null);
  assert.match(
    moderationNotification({ ...notice, status: 'failed' })!.reason,
    /Não foi possível concluir/u,
  );
  assert.match(
    moderationNotification({ ...notice, status: 'held' })!.reason,
    /incerta/u,
  );
});
await test('ler um aviso é limitado ao aparelho/conta, e uma mudança de status gera novo aviso', async (t) => {
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
await test('resposta de moderação da conta anterior não reaparece após troca de sessão', async (t) => {
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
