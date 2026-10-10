import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountSession } from '../src/shared/account/index.ts';
import { ExternalMediaConsent } from '../src/client/external-media/index.ts';

function session(): AccountSession {
  return {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    name: 'Privado',
    address: `0x${'1'.repeat(40)}`,
    ecosystem: 'evm',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    profileRevision: 0,
    walletConfirmed: true,
  };
}
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
const signal = () => new AbortController().signal;

await test('visitante e conta sem @ nunca autorizam vídeo; GIF usa somente aviso KLIPY', async () => {
  const prompts: string[] = [];
  const privacy = new ExternalMediaConsent({
    profile: () => Promise.resolve(false),
    storage: storage(),
    prompt: (scope) => {
      prompts.push(scope);
      return Promise.resolve(true);
    },
  });
  assert.equal(await privacy.authorize('video', signal()), false);
  assert.equal(await privacy.authorize('gifs', signal()), true);
  privacy.setSession(session());
  assert.equal(await privacy.authorize('video', signal()), false);
  assert.equal(await privacy.authorize('gifs', signal()), true);
  assert.deepEqual(prompts, ['gifs', 'gifs']);
});
await test('conta com @ existente escolhe uma vez; a mesma escolha cobre vídeo e GIF', async () => {
  for (const choice of [true, false]) {
    const prompts: string[] = [],
      saved = storage(),
      own = session();
    const options = {
      profile: () => Promise.resolve(true),
      storage: saved,
      prompt: (scope: 'all' | 'gifs') => {
        prompts.push(scope);
        return Promise.resolve(choice);
      },
    };
    const privacy = new ExternalMediaConsent(options);
    privacy.setSession(own);
    assert.equal(await privacy.authorize('video', signal()), choice);
    assert.equal(await privacy.authorize('gifs', signal()), choice);
    const reloaded = new ExternalMediaConsent(options);
    reloaded.setSession(own);
    assert.equal(await reloaded.authorize('video', signal()), choice);
    assert.deepEqual(prompts, ['all']);
  }
});
await test('escolhas isoladas por conta; trocar de conta cancela o aviso e não transfere consentimento', async () => {
  const first = session(),
    second = session();
  const saved = storage();
  let finish: (choice: boolean | null) => void = () => {};
  const privacy = new ExternalMediaConsent({
    profile: () => Promise.resolve(true),
    storage: saved,
    prompt: (_scope, active) =>
      new Promise((resolve) => {
        finish = resolve;
        active.addEventListener('abort', () => resolve(null), { once: true });
      }),
  });
  privacy.setSession(first);
  const pending = privacy.authorize('video', signal());
  await new Promise<void>((resolve) => setImmediate(resolve));
  privacy.setSession(second);
  finish(true);
  assert.equal(await pending, false);
  assert.equal(privacy.permitted('video'), false);
  privacy.created(true);
  assert.equal(privacy.permitted('video'), true);
  privacy.setSession(first);
  assert.equal(privacy.permitted('video'), false);
});
await test('avisos simultâneos compartilham uma escolha e revogação afeta todos os leitores', async () => {
  let count = 0,
    choice = true;
  const privacy = new ExternalMediaConsent({
    profile: () => Promise.resolve(true),
    storage: storage(),
    prompt: () => {
      count++;
      return Promise.resolve(choice);
    },
  });
  privacy.setSession(session());
  assert.deepEqual(
    await Promise.all([
      privacy.authorize('video', signal()),
      privacy.authorize('gifs', signal()),
    ]),
    [true, true],
  );
  assert.equal(count, 1);
  let revoked = false;
  privacy.subscribe(() => {
    revoked = !privacy.permitted('video');
  }, signal());
  choice = false;
  await privacy.configure(signal());
  assert.equal(revoked, true);
  assert.equal(await privacy.authorize('video', signal()), false);
  assert.equal(await privacy.authorize('gifs', signal()), false);
  assert.equal(count, 2);
});
await test('fechar aviso não aceita; falha de perfil e escolha corrompida falham restritas', async () => {
  const privacy = new ExternalMediaConsent({
    profile: () => Promise.reject(new Error('Perfil indisponível')),
    storage: {
      getItem: () => '{"version":1,"all":"true","gifs":true}',
      setItem: () => {},
    },
    prompt: () => Promise.resolve(null),
  });
  privacy.setSession(session());
  await assert.rejects(
    privacy.authorize('video', signal()),
    /Perfil indisponível/u,
  );
  assert.equal(privacy.permitted('video'), false);
  assert.equal(await privacy.beforeCreate(signal()), null);
  assert.equal(privacy.permitted('gifs'), false);
});
