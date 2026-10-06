import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountRateLimit } from '../src/server/account/rate-limit.ts';
await test('consultas não têm teto por minuto; chamadas preservam admissão e comandos separados e Encerrar usa leitura', () => {
  const chat = new AccountRateLimit({ requests: null }),
    admission = new AccountRateLimit({ requests: 900 }),
    sessions = new AccountRateLimit();
  for (let i = 0; i < 1000; i++) {
    chat.admit('synthetic-transport', false);
    chat.admit('synthetic-transport', false, true);
  }
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
  for (let i = 0; i < 1000; i++)
    sessions.admit('synthetic-session-a', false, true);
  sessions.admit('synthetic-session-b', false, true);
  chat.close();
  admission.close();
  sessions.close();
});
