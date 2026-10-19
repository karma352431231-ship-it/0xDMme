import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profileFollows } from '../src/client/public-profile/follows.ts';

const target = crypto.randomUUID();
const own = {
  profile: { id: crypto.randomUUID(), handle: 'sintetico', avatar: null },
  revision: 1,
  pendingAvatar: null,
};

await test('escolha de seguir autor não consulta vínculo consigo mesmo nem aceita falta de perfil', async () => {
  const reads: string[] = [];
  let current: typeof own | null = own;
  const follows = profileFollows({
    perform: (operation) => {
      reads.push(operation);
      assert.equal(operation, 'state');
      return Promise.resolve(current);
    },
  });
  assert.equal(await follows.inspect(own.profile.id), null);
  current = null;
  await assert.rejects(follows.inspect(target), /Create your public profile/);
  assert.deepEqual(reads, ['state', 'state']);
});

await test('seguir autor usa ID estável e revisão lida; conflito não simula sucesso', async () => {
  let conflict = false;
  const follows = profileFollows({
    perform: (operation, payload) => {
      if (operation === 'state') return Promise.resolve(own);
      assert.equal(payload['target'], target);
      if (operation === 'follow-state')
        return Promise.resolve({ following: true, revision: 7 });
      assert.equal(operation, 'follow');
      assert.deepEqual(payload, { target, following: false, revision: 7 });
      if (conflict) return Promise.reject(new Error('Escolha alterada.'));
      return Promise.resolve({ following: false, revision: 8 });
    },
  });
  const state = await follows.inspect(target);
  assert.ok(state);
  assert.deepEqual(await follows.set(target, state), {
    following: false,
    revision: 8,
  });
  conflict = true;
  await assert.rejects(follows.set(target, state), /Escolha alterada/);
});

await test('estado de vínculo inválido não vira uma opção utilizável', async () => {
  const follows = profileFollows({
    perform: (operation) =>
      Promise.resolve(
        operation === 'state' ? own : { following: true, revision: -1 },
      ),
  });
  await assert.rejects(follows.inspect(target), /[Cc]ount/);
});
