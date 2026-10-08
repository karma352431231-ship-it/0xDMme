import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageReadiness } from '../src/client/app/message-readiness.ts';
import type { AccountSession } from '../src/shared/account/index.ts';

const session = {
  accountId: crypto.randomUUID(),
  deviceId: crypto.randomUUID(),
  csrf: 'synthetic',
} as AccountSession;
await test('rechecagens de foco e perfil da mesma sessão autorizada não pedem nova carga de chat', () => {
  const readiness = new MessageReadiness();
  assert.equal(readiness.update(session, false), false);
  assert.equal(readiness.update(session, true), true);
  assert.equal(
    readiness.update({ ...session, name: 'Perfil atualizado' }, true),
    false,
  );
  assert.equal(readiness.update(session, true), false);
});
await test('nova sessão, aparelho, conta e perda/retomada de autorização exigem nova carga', () => {
  const readiness = new MessageReadiness();
  for (const next of [
    session,
    { ...session, csrf: 'another' },
    { ...session, deviceId: crypto.randomUUID() },
    { ...session, accountId: crypto.randomUUID() },
  ])
    assert.equal(readiness.update(next, true), true);
  assert.equal(readiness.update(session, false), false);
  assert.equal(readiness.update(session, true), true);
  assert.equal(readiness.update(null, false), false);
  assert.equal(readiness.update(session, true), true);
});
