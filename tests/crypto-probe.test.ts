import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { ProbeClient } from '../src/client/crypto-probe/index.ts';
import { ProbeRelay } from '../src/server/crypto-probe/index.ts';
import { identity, record } from '../src/shared/crypto-probe/index.ts';
import type { Role } from '../src/shared/crypto-probe/index.ts';
import {
  DecryptionErrorCode,
  MegolmDecryptionError,
} from '@matrix-org/matrix-sdk-crypto-wasm';

async function pair(t: TestContext) {
  const relay = new ProbeRelay();
  const create = (role: Role) =>
    ProbeClient.create(role, (operation, body) =>
      Promise.resolve().then(() => relay.dispatch(role, operation, body)),
    );
  const alice = await create('alice');
  t.after(() => alice.close());
  const bob = await create('bob');
  t.after(() => bob.close());
  await alice.publishKeys();
  await bob.publishKeys();
  return { relay, alice, bob };
}

await test('texto cifrado nos dois sentidos; relay não recebe a mensagem legível', async (t) => {
  const { relay, alice, bob } = await pair(t);
  await alice.confirmPeer(bob.fingerprint);
  await bob.confirmPeer(alice.fingerprint);
  const phrase = 'Texto sintético privado — primeiro cenário';
  const event = await alice.send(phrase);
  assert.equal(relay.inspect().includes(phrase), false);
  await bob.receive();
  assert.equal(await bob.decrypt(event), phrase);
  const reply = await bob.send('Resposta sintética');
  await alice.receive();
  assert.equal(await alice.decrypt(reply), 'Resposta sintética');
});

await test('destinatário recebe depois de ficar offline, dentro da sessão em memória', async (t) => {
  const { alice, bob } = await pair(t);
  await alice.confirmPeer(bob.fingerprint);
  await bob.confirmPeer(alice.fingerprint);
  const event = await alice.send(
    'Mensagem sintética enquanto Bob está offline',
  );
  const queued = await bob.receive();
  assert.equal(queued.length, 1);
  assert.equal(
    await bob.decrypt(event),
    'Mensagem sintética enquanto Bob está offline',
  );
});

await test('chave esperada errada impede envio, sem fallback', async (t) => {
  const { alice } = await pair(t);
  await assert.rejects(alice.confirmPeer('chave falsa'), /não confere/);
  await assert.rejects(alice.send('Não pode sair'), /Confirme a chave/);
});

await test('ciphertext adulterado é rejeitado pelo motor criptográfico', async (t) => {
  const { alice, bob } = await pair(t);
  await alice.confirmPeer(bob.fingerprint);
  await bob.confirmPeer(alice.fingerprint);
  const event = await alice.send('Texto sintético íntegro');
  await bob.receive();
  const content = record(event.content);
  const ciphertext = String(content.ciphertext);
  const replacement = ciphertext[30] === 'A' ? 'B' : 'A';
  const damaged = {
    ...event,
    content: {
      ...content,
      ciphertext: ciphertext.slice(0, 30) + replacement + ciphertext.slice(31),
    },
  };
  await assert.rejects(bob.decrypt(damaged), /Mensagem rejeitada/);
  assert.equal(await bob.decrypt(event), 'Texto sintético íntegro');
});

await test('atribuir autoria falsa ao pacote não o transforma em mensagem autorizada', async (t) => {
  const { alice, bob } = await pair(t);
  await alice.confirmPeer(bob.fingerprint);
  await bob.confirmPeer(alice.fingerprint);
  const event = await alice.send('Texto sintético autenticado');
  await bob.receive();
  await assert.rejects(
    bob.decrypt({ ...event, sender: '@intruso:probe.invalid' }),
    /não autorizado/,
  );
});

await test('relay recusa texto legível e campos secretos em vez de armazená-los', () => {
  const relay = new ProbeRelay();
  assert.throws(
    () => relay.dispatch('alice', 'publish', '{"body":"texto aberto"}'),
    /Campo não permitido/,
  );
  assert.throws(
    () =>
      relay.dispatch('alice', 'upload', '{"private_key":"segredo fictício"}'),
    /Campo não permitido/,
  );
  assert.equal(relay.inspect().includes('segredo fictício'), false);
});

await test('outro cliente com chaves novas não lê os pacotes armazenados para Bob', async (t) => {
  const { relay, alice, bob } = await pair(t);
  await alice.confirmPeer(bob.fingerprint);
  await bob.confirmPeer(alice.fingerprint);
  const event = await alice.send(
    'Texto fictício destinado apenas ao Bob autorizado',
  );
  const isolated = new ProbeRelay();
  const outsider = await ProbeClient.create('bob', (operation, body) =>
    Promise.resolve().then(() => {
      const source = operation === 'upload' ? isolated : relay;
      return source.dispatch('bob', operation, body);
    }),
  );
  t.after(() => outsider.close());
  await outsider.confirmPeer(alice.fingerprint);
  await assert.rejects(outsider.receive(), /Pacote de chave não autorizado/);
  await assert.rejects(outsider.decrypt(event), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(error.cause instanceof MegolmDecryptionError);
    assert.equal(error.cause.code, DecryptionErrorCode.MissingRoomKey);
    return true;
  });
  await bob.receive();
  assert.equal(
    await bob.decrypt(event),
    'Texto fictício destinado apenas ao Bob autorizado',
  );
});

await test('revogação rotaciona a sessão: Bob mantém passado e não abre novas mensagens', async (t) => {
  const { relay, alice, bob } = await pair(t);
  await alice.confirmPeer(bob.fingerprint);
  await bob.confirmPeer(alice.fingerprint);
  const before = await alice.send('Antes da revogação');
  await bob.receive();
  assert.equal(await bob.decrypt(before), 'Antes da revogação');
  const packetsBefore = relay.inspect();
  await alice.revokePeer();
  const after = await alice.send('Depois da revogação');
  assert.notEqual(
    record(after.content).session_id,
    record(before.content).session_id,
  );
  const beforeState = JSON.parse(packetsBefore) as { to_device: unknown };
  const afterState = JSON.parse(relay.inspect()) as { to_device: unknown };
  assert.deepEqual(afterState.to_device, beforeState.to_device);
  await bob.receive();
  await assert.rejects(bob.decrypt(after), /Mensagem rejeitada/);
  assert.equal(await bob.decrypt(before), 'Antes da revogação');
  await assert.rejects(alice.confirmPeer(bob.fingerprint), /revogado/);
});

await test('revogação e envio concorrentes respeitam a ordem, sem usar sessão antiga', async (t) => {
  const { alice, bob } = await pair(t);
  await alice.confirmPeer(bob.fingerprint);
  await bob.confirmPeer(alice.fingerprint);
  const before = await alice.send('Mensagem anterior');
  await bob.receive();
  await bob.decrypt(before);
  const revocation = alice.revokePeer();
  const delivery = alice.send('Envio concorrente posterior');
  await revocation;
  const event = await delivery;
  await bob.receive();
  await assert.rejects(bob.decrypt(event), /Mensagem rejeitada/);
});

await test('repetir um ciphertext com novo identificador não produz uma segunda mensagem', async (t) => {
  const { alice, bob } = await pair(t);
  await alice.confirmPeer(bob.fingerprint);
  await bob.confirmPeer(alice.fingerprint);
  const event = await alice.send('Mensagem única');
  await bob.receive();
  assert.equal(await bob.decrypt(event), 'Mensagem única');
  await assert.rejects(
    bob.decrypt({ ...event, event_id: '$replay-synthetic' }),
    /Mensagem rejeitada/,
  );
});

await test('diretório hostil não substitui a chave de criptografia com assinatura inválida', async (t) => {
  const { relay, alice, bob } = await pair(t);
  const attacked = new ProbeRelay();
  const observer = await ProbeClient.create('alice', (operation, body) =>
    Promise.resolve().then(() => {
      if (operation === 'upload')
        return attacked.dispatch('alice', operation, body);
      const response = relay.dispatch('alice', operation, body);
      if (operation !== 'query') return response;
      const query = JSON.parse(response) as unknown;
      const directory = record(record(query).device_keys);
      const device = record(
        record(directory[identity('bob').user])[identity('bob').device],
      );
      record(device.keys)['curve25519:BOB'] =
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      return JSON.stringify(query);
    }),
  );
  t.after(() => observer.close());
  await observer.publishKeys();
  await assert.rejects(observer.confirmPeer(bob.fingerprint));
  await assert.rejects(
    observer.send('Texto não pode sair com chave adulterada'),
    /Confirme a chave/,
  );
  await alice.confirmPeer(bob.fingerprint);
});
