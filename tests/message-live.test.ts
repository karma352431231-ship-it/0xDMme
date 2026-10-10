import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Socket } from 'node:net';
import { IncomingMessage, ServerResponse } from 'node:http';
import { DatabaseChanges } from '../src/server/database/index.ts';
import { MessageLive } from '../src/server/message-live/index.ts';
import {
  WakeupFrames,
  LiveMessages,
  LiveUpdates,
} from '../src/client/message-live/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
function session(account: string = crypto.randomUUID()): AccountSession {
  return {
    accountId: account,
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    address: '0x' + '1'.repeat(40),
    ecosystem: 'evm',
    name: 'Sintético',
    profileRevision: 0,
    deviceState: 'pending',
    historyAuthorized: false,
  };
}
function response() {
  const output = new ServerResponse(new IncomingMessage(new Socket())),
    frames: string[] = [];
  // Unit fixture captures transport frames; the integration test exercises actual HTTP sockets.
  output.write = (chunk: unknown) => {
    frames.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  };
  output.end = () => {
    output.emit('close');
    return output;
  };
  return { output, text: () => frames.join('') };
}
function turn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
await test('SSE de sessão de 160 dias não encerra entre timers e respeita a expiração completa', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  const lifetime = 160 * 24 * 60 * 60 * 1000;
  const live = new MessageLive(new DatabaseChanges());
  t.after(() => live.close());
  const target = response();
  live.open({
    session: {
      ...session(),
      expiresAt: new Date(Date.now() + lifetime).toISOString(),
    },
    response: target.output,
    validate: () => Promise.resolve(true),
  });
  let remaining = lifetime;
  while (remaining > 1) {
    const delay = Math.min(remaining - 1, 2_147_483_647);
    t.mock.timers.tick(delay);
    remaining -= delay;
    assert.doesNotMatch(target.text(), /event: ended/u);
  }
  t.mock.timers.tick(1);
  assert.match(target.text(), /event: ended/u);
});

await test('avisos próximos geram uma sondagem; reconexão exige refresh e não pode ser rebaixada por changed', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const applied: string[] = [];
  const updates = new LiveUpdates({
    available: () => true,
    run: (update) => applied.push(update),
  });
  for (let i = 0; i < 100; i++) updates.request('probe');
  t.mock.timers.tick(149);
  assert.deepEqual(applied, []);
  t.mock.timers.tick(1);
  assert.deepEqual(applied, ['probe']);
  updates.request('probe');
  updates.request('refresh');
  updates.request('probe');
  t.mock.timers.tick(150);
  assert.deepEqual(applied, ['probe', 'refresh']);
});
await test('avisos durante trabalho ou suspensão aguardam retomada; troca de sessão cancela o pedido antigo', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const applied: string[] = [];
  let available = false;
  const updates = new LiveUpdates({
    available: () => available,
    run: (update) => {
      applied.push(update);
      available = false;
    },
  });
  updates.request('probe');
  updates.request('probe');
  t.mock.timers.tick(1000);
  assert.deepEqual(applied, []);
  available = true;
  updates.resume();
  t.mock.timers.tick(150);
  assert.deepEqual(applied, ['probe']);
  updates.request('refresh');
  updates.request('probe');
  available = true;
  updates.resume();
  available = false;
  t.mock.timers.tick(150);
  assert.deepEqual(applied, ['probe']);
  available = true;
  updates.resume();
  t.mock.timers.tick(150);
  assert.deepEqual(applied, ['probe', 'refresh']);
  available = true;
  updates.request('refresh');
  updates.clear();
  t.mock.timers.tick(1000);
  updates.resume();
  t.mock.timers.tick(150);
  assert.deepEqual(applied, ['probe', 'refresh']);
});
await test('SSE admite mais de 8 clientes/2 abas; fanout só para contas afetadas e heartbeat sem banco', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const changes = new DatabaseChanges(),
    live = new MessageLive(changes);
  t.after(() => live.close());
  let checked = 0;
  const targets = Array.from({ length: 1000 }, () => ({
    session: session(),
    ...response(),
  }));
  const first = targets[0];
  assert.ok(first);
  for (let i = 0; i < 3; i++)
    targets.push({ session: first.session, ...response() });
  for (const target of targets)
    live.open({
      session: target.session,
      response: target.output,
      validate: () => {
        checked++;
        return Promise.resolve(true);
      },
    });
  assert.ok(targets.every((target) => target.text().includes('event: ready')));
  t.mock.timers.tick(5000);
  await turn();
  assert.equal(checked, 0);
  assert.ok(targets.every((target) => target.text().includes(': heartbeat')));
  changes.committed([first.session.accountId]);
  changes.committed([first.session.accountId]);
  t.mock.timers.tick(100);
  await turn();
  assert.equal(checked, 4);
  assert.equal(
    targets.filter((target) => target.text().includes('event: changed')).length,
    4,
  );
  assert.ok(
    targets.every(
      (target) => !target.text().includes(target.session.accountId),
    ),
  );
});
await test('eventos encerram apenas sessão/aparelho afetado; falha de autorização fecha stream e cliente lento não acumula fila', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const changes = new DatabaseChanges(),
    live = new MessageLive(changes),
    first = session(),
    second = { ...session(first.accountId), csrf: 'b'.repeat(64) };
  const a = response(),
    b = response();
  t.after(() => live.close());
  live.open({
    session: first,
    response: a.output,
    validate: () => Promise.resolve(true),
  });
  live.open({
    session: second,
    response: b.output,
    validate: () => Promise.resolve(true),
  });
  changes.committed([first.accountId], {
    authorization: true,
    revoked: [first.deviceId],
    removed: true,
  });
  assert.match(a.text(), /event: revoked/);
  assert.doesNotMatch(a.text(), /event: removed/);
  assert.doesNotMatch(b.text(), /event: revoked/);
  changes.committed([second.accountId], {
    authorization: true,
    ended: [second.csrf],
  });
  assert.match(b.text(), /event: ended/);
  const c = response(),
    third = session();
  live.open({
    session: third,
    response: c.output,
    validate: () => Promise.resolve(false),
  });
  changes.committed([third.accountId]);
  t.mock.timers.tick(100);
  await turn();
  assert.match(c.text(), /event: invalidated/);
  assert.doesNotMatch(c.text(), /event: changed/);
  const slow = response();
  slow.output.write = () => false;
  live.open({
    session: session(),
    response: slow.output,
    validate: () => Promise.resolve(true),
  });
  assert.equal(slow.output.destroyed, true);
});
await test('exclusão envia somente aviso vazio às contas afetadas sem esperar lote ou autorização da atualização normal', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const changes = new DatabaseChanges(),
    live = new MessageLive(changes);
  t.after(() => live.close());
  const first = session(),
    second = session(),
    unrelated = session();
  const targets = [first, first, second, unrelated].map((s) => ({
    session: s,
    ...response(),
  }));
  let release: (() => void) | undefined;
  const checking = new Promise<boolean>((resolve) => {
    release = () => resolve(true);
  });
  for (const target of targets)
    live.open({
      session: target.session,
      response: target.output,
      validate: () => checking,
    });
  changes.committed([first.accountId, second.accountId]);
  t.mock.timers.tick(100);
  await turn();
  assert.ok(
    targets.every((target) => !target.text().includes('event: changed')),
  );
  changes.committed([first.accountId, second.accountId], { removed: true });
  const parser = new WakeupFrames();
  for (const target of targets.slice(0, 3)) {
    assert.deepEqual(parser.accept(new TextEncoder().encode(target.text())), [
      'ready',
      'removed',
    ]);
    assert.ok(!target.text().includes(target.session.accountId));
  }
  assert.doesNotMatch(targets[3]!.text(), /event: removed/);
  release?.();
  await turn();
  assert.ok(
    targets
      .slice(0, 3)
      .every((target) => target.text().includes('event: changed')),
  );
});
await test('falha de publicação de aviso não transforma um commit durável em erro; observador falha fechando canais', () => {
  const changes = new DatabaseChanges();
  let failed = 0;
  const stop = changes.observe({
    notify: () => {
      throw new Error('socket');
    },
    failed: () => {
      failed++;
    },
  });
  assert.doesNotThrow(() => changes.committed(['account']));
  assert.equal(failed, 1);
  stop();
  changes.committed(['account']);
  assert.equal(failed, 1);
});
await test('parser SSE suporta UTF-8 fragmentado e recusa conteúdo, campos extras, excesso e frames truncados', () => {
  const parser = new WakeupFrames(),
    found: string[] = [];
  const events = [
    'ready',
    'changed',
    'removed',
    'authorization',
    'invalidated',
    'revoked',
    'ended',
  ];
  const bytes = new TextEncoder().encode(
    ': heartbeat\n\n' +
      events.map((event) => `event: ${event}\ndata: {}\n\n`).join(''),
  );
  for (const byte of bytes)
    found.push(...parser.accept(new Uint8Array([byte])));
  assert.deepEqual(found, events);
  for (const text of [
    'event: changed\ndata: {"message":"privado"}\n\n',
    'id: 1\nevent: changed\ndata: {}\n\n',
    'x'.repeat(129),
  ])
    assert.throws(() =>
      new WakeupFrames().accept(new TextEncoder().encode(text)),
    );
  assert.throws(() => new WakeupFrames().accept(new Uint8Array(4097)));
  assert.throws(() => new WakeupFrames().accept(new Uint8Array([255])));
});
const authority: VaultAuthority = {
  session: {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
  },
  directory: 'b'.repeat(64),
  epoch: 1,
  events: [],
  offline: false,
  key: () => Promise.reject(new Error('Not used')),
  sign: () => Promise.resolve('signature'),
};
function access(work: VaultAccess['withVault']): VaultAccess {
  return {
    withVault: work,
    withLocalVault: (_locator, action) => action(authority),
  };
}
await test('retomada e ready tardio pedem uma única carga depois do handshake, sem iniciar leitura que seria cancelada', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
    live.stop();
    updates.clear();
  });
  const applied: string[] = [];
  const updates = new LiveUpdates({
    available: () => !live.connecting,
    run: (update) => applied.push(update),
  });
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            setTimeout(
              () =>
                controller.enqueue(
                  new TextEncoder().encode('event: ready\ndata: {}\n\n'),
                ),
              350,
            );
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    );
  const live = new LiveMessages({
    access: access((_offline, work) => work(authority)),
    changed: () => updates.resume(),
    event: () => updates.request('refresh'),
  });
  live.start();
  updates.request('refresh');
  await turn();
  assert.equal(live.connecting, true);
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(applied, []);
  t.mock.timers.tick(200);
  await turn();
  assert.equal(live.connecting, false);
  assert.equal(live.connected, true);
  t.mock.timers.tick(150);
  assert.deepEqual(applied, ['refresh']);
});

await test('falha do handshake libera a conferência pendente sem depender de ready; suspensão cancela a abertura', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.fetch;
  const applied: string[] = [];
  const updates = new LiveUpdates({
    available: () => !live.connecting,
    run: (update) => applied.push(update),
  });
  globalThis.fetch = () => Promise.resolve(new Response('{}', { status: 503 }));
  const live = new LiveMessages({
    access: access((_offline, work) => work(authority)),
    changed: () => updates.resume(),
    event: () => {},
  });
  t.after(() => {
    globalThis.fetch = original;
    live.stop();
    updates.clear();
  });
  live.start();
  updates.request('refresh');
  await turn();
  assert.equal(live.connecting, false);
  assert.equal(live.connected, false);
  t.mock.timers.tick(150);
  assert.deepEqual(applied, ['refresh']);
  live.stop();
  live.start();
  assert.equal(live.connecting, true);
  updates.request('refresh');
  live.stop();
  updates.clear();
  await turn();
  t.mock.timers.tick(150);
  assert.equal(live.connecting, false);
  assert.deepEqual(applied, ['refresh']);
});

await test('handshake sem resposta tem prazo e libera a conferência pendente pelo fallback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.fetch;
  const applied: string[] = [];
  const updates = new LiveUpdates({
    available: () => !live.connecting,
    run: (update) => applied.push(update),
  });
  globalThis.fetch = (_input, options) =>
    new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () =>
        reject(new Error('Handshake interrompido.')),
      );
    });
  const live = new LiveMessages({
    access: access((_offline, work) => work(authority)),
    changed: () => updates.resume(),
    event: () => {},
  });
  t.after(() => {
    globalThis.fetch = original;
    live.stop();
    updates.clear();
  });
  live.start();
  updates.request('refresh');
  await turn();
  t.mock.timers.tick(14999);
  await turn();
  assert.equal(live.connecting, true);
  assert.deepEqual(applied, []);
  t.mock.timers.tick(1);
  await turn();
  assert.equal(live.connecting, false);
  t.mock.timers.tick(150);
  assert.deepEqual(applied, ['refresh']);
});

await test('stream não mantém trava do cofre; quedas reconectam com ready e três falhas encerram tentativas automáticas', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let locked = false,
    requests = 0;
  const events: string[] = [];
  globalThis.fetch = () => {
    assert.equal(locked, false);
    requests++;
    return Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'event: ready\ndata: {}\n\nevent: changed\ndata: {}\n\n',
              ),
            );
            controller.close();
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    );
  };
  const live = new LiveMessages({
    access: access(async (_offline, work) => {
      locked = true;
      try {
        return await work(authority);
      } finally {
        locked = false;
      }
    }),
    event: (event) => events.push(event),
    changed: () => {},
  });
  t.after(() => live.stop());
  live.start();
  await turn();
  t.mock.timers.tick(3000);
  await turn();
  t.mock.timers.tick(6000);
  await turn();
  t.mock.timers.tick(60_000);
  await turn();
  assert.equal(requests, 3);
  assert.deepEqual(events, [
    'ready',
    'changed',
    'ready',
    'changed',
    'ready',
    'changed',
  ]);
  assert.equal(live.connected, false);
  assert.match(live.notice, /30 segundos/);
});
await test('cancelar antes da assinatura impede abrir conexão com sessão antiga', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let fetched = 0,
    release: (() => void) | undefined;
  globalThis.fetch = () => {
    fetched++;
    return Promise.reject(new Error('Não deve ocorrer'));
  };
  const a = {
    ...authority,
    sign: () =>
      new Promise<string>((resolve) => {
        release = () => resolve('signature');
      }),
  };
  const live = new LiveMessages({
    access: access((_offline, work) => work(a)),
    event: () => {},
    changed: () => {},
  });
  live.start();
  live.stop();
  release?.();
  await turn();
  assert.equal(fetched, 0);
});

await test('reconexão recusada por sessão encerrada comunica fim da autorização e não fica tentando indefinidamente', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const events: string[] = [];
  let requests = 0;
  globalThis.fetch = () => {
    requests++;
    return Promise.resolve(new Response('{}', { status: 401 }));
  };
  const live = new LiveMessages({
    access: access((_offline, work) => work(authority)),
    event: (event) => events.push(event),
    changed: () => {},
  });
  t.after(() => live.stop());
  live.start();
  await turn();
  assert.deepEqual(events, ['ended']);
  assert.equal(requests, 1);
  assert.equal(live.connected, false);
});

await test('diretório alterado durante abertura confere autorização sem anunciar revogação', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const events: string[] = [];
  globalThis.fetch = () => Promise.resolve(new Response('{}', { status: 403 }));
  const live = new LiveMessages({
    access: access((_offline, work) => work(authority)),
    event: (event) => events.push(event),
    changed: () => {},
  });
  t.after(() => live.stop());
  live.start();
  await turn();
  assert.deepEqual(events, ['invalidated']);
  assert.equal(live.connected, false);
});
