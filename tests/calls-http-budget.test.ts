import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountRateLimit } from '../src/server/account/rate-limit.ts';
await test('orçamento de chamadas é separado: chat mantém 60/240, sessão não interfere nas demais e Encerrar usa leitura', () => {
  const chat = new AccountRateLimit(),
    admission = new AccountRateLimit({ requests: 900 }),
    sessions = new AccountRateLimit();
  for (let i = 0; i < 60; i++) chat.admit('synthetic-transport', false);
  assert.throws(
    () => chat.admit('synthetic-transport', false),
    /Muitos pedidos/u,
  );
  for (let i = 0; i < 900; i++) admission.admit('synthetic-transport', false);
  assert.throws(
    () => admission.admit('synthetic-transport', false),
    /Muitos pedidos/u,
  );
  for (let i = 0; i < 60; i++) sessions.admit('synthetic-session-a', false);
  assert.throws(
    () => sessions.admit('synthetic-session-a', false),
    /Muitos pedidos/u,
  );
  // Heartbeat and authenticated End remain available after command exhaustion.
  for (let i = 0; i < 240; i++)
    sessions.admit('synthetic-session-a', false, true);
  assert.throws(
    () => sessions.admit('synthetic-session-a', false, true),
    /Muitos pedidos/u,
  );
  sessions.admit('synthetic-session-b', false, true);
  chat.close();
  admission.close();
  sessions.close();
});
