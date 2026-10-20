import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  newRecoverySecret,
  openHistory,
  sealHistory,
} from '../src/client/vault-probe/index.ts';
import { ProbeClient } from '../src/client/crypto-probe/index.ts';
import { ProbeRelay } from '../src/server/crypto-probe/index.ts';
import { identity } from '../src/shared/crypto-probe/index.ts';
import { decode, encode } from '../src/shared/vault-probe/index.ts';

const owner = identity('alice').user;
const snapshot = {
  owner,
  revision: 1,
  messages: [
    { id: 'synthetic-1', body: 'Histórico fictício protegido no cofre' },
  ],
};

await test('relay receives only encrypted vault; clean reader recovers with the correct secret', async () => {
  const relay = new ProbeRelay();
  const secret = newRecoverySecret();
  const sealed = await sealHistory(snapshot, secret);
  relay.dispatch('alice', 'vault-save', JSON.stringify(sealed));
  assert.equal(
    relay.inspect().includes(snapshot.messages[0]?.body ?? ''),
    false,
  );
  assert.equal(relay.inspect().includes(secret), false);
  // Reader uses only the envelope, secret and expected identity, without the encrypting object.
  assert.deepEqual(
    await openHistory(
      relay.dispatch('alice', 'vault-load', '{}'),
      secret,
      owner,
    ),
    snapshot,
  );
});

await test('wrong secret or altered ciphertext, encapsulation or header fails', async () => {
  const secret = newRecoverySecret();
  const sealed = await sealHistory(snapshot, secret);
  await assert.rejects(
    openHistory(JSON.stringify(sealed), newRecoverySecret(), owner),
    /Vault rejected/,
  );
  for (const field of ['ciphertext', 'wrappedKey', 'iv', 'wrapIv'] as const) {
    const bytes = decode(sealed[field], 32_016);
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    await assert.rejects(
      openHistory(
        JSON.stringify({ ...sealed, [field]: encode(bytes) }),
        secret,
        owner,
      ),
      /Vault rejected/,
    );
  }
  await assert.rejects(
    openHistory(JSON.stringify({ ...sealed, revision: 2 }), secret, owner),
    /Vault rejected/,
  );
  await assert.rejects(
    openHistory(JSON.stringify(sealed), secret, '@bob:probe.invalid'),
    /another (?:Olm )?identity/,
  );
});

await test('old historical backup is allowed and grants no authority to a new device', async (t) => {
  const secret = newRecoverySecret();
  const older = await sealHistory(snapshot, secret);
  const newer = await sealHistory({ ...snapshot, revision: 2 }, secret);
  assert.notEqual(newer.wrappedKey, older.wrappedKey);
  assert.deepEqual(
    await openHistory(JSON.stringify(older), secret, owner),
    snapshot,
  );
  const fresh = await ProbeClient.create('alice', () =>
    Promise.reject(new Error('Rede não deve ser chamada.')),
  );
  t.after(() => fresh.close());
  await assert.rejects(
    fresh.send('Histórico restaurado não autoriza envio'),
    /Confirm the other client's key/,
  );
});

await test('permission fields, unknown versions and malformed inputs are rejected', async () => {
  const secret = newRecoverySecret();
  await assert.rejects(
    sealHistory({ ...snapshot, messages: [{ id: '1', body: '' }] }, secret),
    /Invalid text/,
  );
  const sealed = await sealHistory(snapshot, secret);
  await assert.rejects(
    openHistory(JSON.stringify({ ...sealed, version: 2 }), secret, owner),
    /Unsupported/,
  );
  await assert.rejects(
    openHistory(
      JSON.stringify({ ...sealed, authorizedDevices: ['intruso'] }),
      secret,
      owner,
    ),
    /Field not allowed/,
  );
  const relay = new ProbeRelay();
  assert.throws(
    () =>
      relay.dispatch(
        'alice',
        'vault-save',
        JSON.stringify({ ...sealed, secret }),
      ),
    /Field not allowed/,
  );
  relay.dispatch('alice', 'vault-save', JSON.stringify(sealed));
  assert.throws(
    () => relay.dispatch('alice', 'vault-save', JSON.stringify(sealed)),
    /Outdated/,
  );
});
