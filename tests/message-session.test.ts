import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  initAsync,
  OlmMachine,
  KeysQueryRequest,
  UserId,
} from '@matrix-org/matrix-sdk-crypto-wasm';
import { MessageCrypto } from '../src/client/message-crypto/index.ts';
import {
  createRecoveryKey,
  openRecoveryKey,
  openRoomKey,
} from '../src/client/message-recovery/index.ts';
import { matrixUser } from '../src/shared/messages/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';
import { messageTransport } from './fixtures/message-transport.ts';
import { object } from '../src/shared/account/index.ts';

await initAsync();
await test('envio completa a consulta rastreada do SDK antes de estabelecer sessões e conserva recuperação real', async (t) => {
  const sender = await groupParticipant(),
    peer = await groupParticipant();
  const fixture = messageTransport();
  const machine = await MessageCrypto.create({
    accountId: sender.accountId,
    deviceId: sender.deviceId,
    store: null,
    transport: fixture.transport,
  });
  const reader = await MessageCrypto.create({
    accountId: peer.accountId,
    deviceId: peer.deviceId,
    store: null,
    transport: fixture.transport,
  });
  t.after(() => {
    machine.close();
    reader.close();
  });
  const original = Object.getOwnPropertyDescriptor(
    OlmMachine.prototype,
    'getMissingSessions',
  )?.value as OlmMachine['getMissingSessions'];
  let checked = 0;
  t.mock.method(
    OlmMachine.prototype,
    'getMissingSessions',
    async function (this: OlmMachine, users: UserId[]) {
      const pending = await this.outgoingRequests();
      try {
        assert.equal(
          pending.some((request) => request instanceof KeysQueryRequest),
          false,
          'A consulta rastreada ainda está pendente: o SDK aguardaria o timeout de cinco segundos.',
        );
        checked++;
      } finally {
        for (const request of pending) request.free();
      }
      return original.call(this, users);
    },
  );
  const recovery = await Promise.all(
    [sender, peer].map((p) => createRecoveryKey(p.authority)),
  );
  for (const text of ['primeiro envio sintético', 'segundo envio sintético']) {
    const packet = await machine.encrypt({
      authority: sender.authority,
      peerHistory: [peer.directory],
      recovery,
      id: crypto.randomUUID(),
      text,
    });
    assert.equal(JSON.stringify(packet).includes(text), false);
    const key = await openRecoveryKey(recovery[1]!, peer.authority);
    try {
      const archive = packet.archives.find(
        (a) => a.accountId === peer.accountId,
      );
      assert.ok(archive);
      assert.equal(
        await reader.decrypt({
          packet,
          senderEvent: sender.directory,
          exported: openRoomKey(key, archive),
        }),
        text,
      );
    } finally {
      key.free();
    }
  }
  assert.equal(checked, 2);
});

await test('prepare só atende consultas da própria conta; fila de outro usuário não é despachada sem contexto', async (t) => {
  const sender = await groupParticipant(),
    foreign = matrixUser(crypto.randomUUID());
  const fixture = messageTransport(),
    original = Object.getOwnPropertyDescriptor(
      OlmMachine.prototype,
      'outgoingRequests',
    )?.value as OlmMachine['outgoingRequests'];
  t.mock.method(
    OlmMachine.prototype,
    'outgoingRequests',
    async function (this: OlmMachine) {
      return [
        ...(await original.call(this)),
        this.queryKeysForUsers([new UserId(foreign)]),
      ];
    },
  );
  const machine = await MessageCrypto.create({
    accountId: sender.accountId,
    deviceId: sender.deviceId,
    store: null,
    transport: fixture.transport,
  });
  t.after(() => machine.close());
  await machine.prepare(sender.authority);
  assert.deepEqual(fixture.queries, [[matrixUser(sender.accountId)]]);
});

await test('consulta automática também recusa chave Matrix adulterada', async (t) => {
  const sender = await groupParticipant(),
    fixture = messageTransport();
  const machine = await MessageCrypto.create({
    accountId: sender.accountId,
    deviceId: sender.deviceId,
    store: null,
    transport: async (operation, payload) => {
      const result = object(await fixture.transport(operation, payload));
      if (operation === 'matrix-query') {
        const binding = fixture.bindings.get(matrixUser(sender.accountId));
        assert.ok(binding);
        binding.public.keys[`ed25519:${sender.deviceId}`] = 'a'.repeat(43);
      }
      return result;
    },
  });
  t.after(() => machine.close());
  await assert.rejects(machine.prepare(sender.authority));
});
