import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Wallet, getBytes, hashMessage, hexlify } from 'ethers';
import { secp256k1 } from '@noble/curves/secp256k1';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import type { AccountSession } from '../src/shared/account/index.ts';
import {
  canonical,
  identityOf,
  verifyHistory,
  verifyTransition,
} from '../src/shared/devices/index.ts';
import {
  recoveryMessage,
  recoveryIdentity,
} from '../src/shared/wallet-recovery/index.ts';
import {
  createWalletRecovery,
  walletRecoveryKey,
  signRecovery,
} from '../src/client/wallet-recovery/index.ts';
import {
  createIdentity,
  createRecovery,
  recoverSecrets,
  deviceSecrets,
  newSecret,
  signEvent,
} from '../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
  recoveryIdentities,
} from '../src/client/device-operations/index.ts';
import type { WalletConnection } from '../src/client/wallet/index.ts';

const origin = 'https://0xdmme.app';
const signer = new Wallet(`0x${'1'.padStart(64, '0')}`);
function session(): AccountSession {
  return {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    ecosystem: 'evm',
    address: signer.address.toLowerCase(),
    csrf: 'a'.repeat(64),
    name: '',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    profileRevision: 0,
    historyAuthorized: false,
    deviceState: 'pending',
  };
}

await test('recuperação original: assinatura exclusiva abre cápsula após serialização; outra conta/mensagem/origem falha', async () => {
  const user = session();
  const config = createWalletRecovery(user, origin);
  const signature = await signer.signMessage(recoveryMessage(config));
  const key = await walletRecoveryKey(config, [
    signature,
    await signer.signMessage(recoveryMessage(config)),
  ]);
  assert.equal(key.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('raw', key));
  const authority = await createRecovery(user.accountId, key, config);
  const identity = await createIdentity(user.deviceId, 'Mac');
  const ring = freshKeyring(user.accountId);
  const event = await prepareEvent({
    accountId: user.accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: authority.signing,
    root: authority.root,
    identities: [identity.public],
    ring,
    profile: null,
  });
  const serialized = canonical(event);
  assert.equal(serialized.includes(signature), false);
  assert.equal(serialized.includes(ring.keys[0] ?? ''), false);
  const fresh = new Wallet(signer.privateKey);
  const recovered = await recoverSecrets(
    JSON.parse(serialized) as typeof event,
    await walletRecoveryKey(config, [
      await fresh.signMessage(recoveryMessage(config)),
    ]),
  );
  assert.deepEqual(recovered.ring, ring);
  const outsider = new Wallet(`0x${'2'.padStart(64, '0')}`);
  await assert.rejects(
    walletRecoveryKey(config, [
      await outsider.signMessage(recoveryMessage(config)),
    ]),
  );
  await assert.rejects(
    walletRecoveryKey(config, [
      await signer.signMessage('0xDMme login público'),
    ]),
  );
  await assert.rejects(
    walletRecoveryKey({ ...config, id: crypto.randomUUID() }, [signature]),
  );
  assert.throws(() =>
    recoveryIdentity(
      config,
      { ...user, accountId: crypto.randomUUID() },
      origin,
    ),
  );
  assert.throws(() => recoveryIdentity(config, user, 'https://other.example'));
  await assert.rejects(
    recoverSecrets(
      {
        ...event,
        root: { ...event.root, wallet: { ...config, salt: newSecret() } },
      },
      key,
    ),
  );
});
await test('Solana: mesma mensagem e conta recuperam cápsula com assinatura Ed25519, sem código', async () => {
  const seed = new Uint8Array(32).fill(7);
  const user = {
    ...session(),
    ecosystem: 'solana' as const,
    address: base58.encode(ed25519.getPublicKey(seed)),
  };
  const config = createWalletRecovery(user, origin);
  const signature = base58.encode(
    ed25519.sign(new TextEncoder().encode(recoveryMessage(config)), seed),
  );
  const key = await walletRecoveryKey(config, [signature, signature]);
  const authority = await createRecovery(user.accountId, key, config);
  const identity = await createIdentity(user.deviceId, 'Solana');
  const ring = freshKeyring(user.accountId);
  const event = await prepareEvent({
    accountId: user.accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: authority.signing,
    root: authority.root,
    identities: [identity.public],
    ring,
    profile: null,
  });
  assert.deepEqual(
    (await recoverSecrets(event, await walletRecoveryKey(config, [signature])))
      .ring,
    ring,
  );
  const wrong = base58.encode(
    ed25519.sign(
      new TextEncoder().encode(recoveryMessage(config)),
      new Uint8Array(32).fill(8),
    ),
  );
  await assert.rejects(walletRecoveryKey(config, [wrong]));
});
await test('assinatura EVM válida mas variável é recusada na configuração e não abre a cápsula existente', async () => {
  const config = createWalletRecovery(session(), origin);
  const signature = await signer.signMessage(recoveryMessage(config));
  const alternate = secp256k1.sign(
    getBytes(hashMessage(recoveryMessage(config))),
    getBytes(signer.privateKey),
    { extraEntropy: true },
  );
  const other = `${hexlify(alternate.toCompactRawBytes())}${(27 + alternate.recovery).toString(16)}`;
  await assert.rejects(
    walletRecoveryKey(config, [signature, other]),
    /assinaturas diferentes/,
  );
  const key = await walletRecoveryKey(config, [signature]);
  const authority = await createRecovery(config.accountId, key, config);
  const identity = await createIdentity(crypto.randomUUID(), 'A');
  const event = await prepareEvent({
    accountId: config.accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: authority.signing,
    root: authority.root,
    identities: [identity.public],
    ring: freshKeyring(config.accountId),
    profile: null,
  });
  await assert.rejects(
    recoverSecrets(event, await walletRecoveryKey(config, [other])),
  );
});
await test('migração assinada pela autoridade antiga preserva épocas/aparelhos e retira autoridade do código antigo', async (t) => {
  const user = session();
  const first = await createIdentity(user.deviceId, 'A');
  const second = await createIdentity(crypto.randomUUID(), 'B');
  const third = await createIdentity(crypto.randomUUID(), 'C');
  const legacy = newSecret();
  const old = await createRecovery(user.accountId, legacy);
  const ring = freshKeyring(user.accountId);
  const genesis = await prepareEvent({
    accountId: user.accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: old.signing,
    root: old.root,
    identities: [first.public],
    ring,
    profile: null,
  });
  const linked = await prepareEvent({
    accountId: user.accountId,
    previous: genesis,
    kind: 'link',
    signer: first.public.id,
    signing: first.signing,
    root: old.root,
    identities: [first.public, second.public],
    ring,
    linkId: crypto.randomUUID(),
    profile: null,
  });
  const config = createWalletRecovery(user, origin);
  const signature = await signer.signMessage(recoveryMessage(config));
  const key = await walletRecoveryKey(config, [signature, signature]);
  const next = await createRecovery(user.accountId, key, config);
  const migratedRing = freshKeyring(
    user.accountId,
    (await recoverSecrets(linked, legacy)).ring,
  );
  const migrated = await prepareEvent({
    accountId: user.accountId,
    previous: linked,
    kind: 'migrate',
    signer: 'recovery',
    signing: old.signing,
    root: next.root,
    identities: linked.devices.map(identityOf),
    ring: migratedRing,
    profile: null,
  });
  assert.deepEqual((await recoverSecrets(migrated, key)).ring, migratedRing);
  assert.deepEqual(migratedRing.keys.slice(0, ring.epoch), ring.keys);
  assert.deepEqual(await deviceSecrets(second, migrated), migratedRing);
  assert.equal(
    (await verifyHistory([genesis, linked, migrated], user.accountId))
      ?.revision,
    3,
  );
  await assert.rejects(recoverSecrets(migrated, legacy));
  await assert.rejects(
    verifyTransition(linked, await signEvent(migrated, next.signing)),
  );
  await assert.rejects(
    verifyTransition(linked, {
      ...migrated,
      root: { ...next.root, signing: first.public.signing },
    }),
  );
  await t.test(
    'recuperação pela wallet mantém todos, alguns ou nenhum aparelho conforme seleção',
    async () => {
      for (const revoked of [
        [],
        [second.public.id],
        [first.public.id, second.public.id],
      ]) {
        const restored = await recoverSecrets(
          migrated,
          await walletRecoveryKey(config, [signature]),
        );
        const nextRing = freshKeyring(user.accountId, restored.ring);
        const event = await prepareEvent({
          accountId: user.accountId,
          previous: migrated,
          kind: 'recover',
          signer: 'recovery',
          signing: restored.signing,
          root: next.root,
          identities: [...recoveryIdentities(migrated, revoked), third.public],
          ring: nextRing,
          profile: null,
        });
        assert.deepEqual(await deviceSecrets(third, event), nextRing);
        assert.deepEqual(
          nextRing.keys.slice(0, migratedRing.epoch),
          migratedRing.keys,
        );
        for (const identity of [first, second]) {
          if (revoked.includes(identity.public.id))
            await assert.rejects(deviceSecrets(identity, event));
          else assert.deepEqual(await deviceSecrets(identity, event), nextRing);
        }
        await assert.rejects(
          verifyTransition(migrated, await signEvent(event, old.signing)),
        );
      }
    },
  );
});
await test('erros da wallet e de parsing nunca devolvem assinatura privada ao texto de erro', async () => {
  const config = createWalletRecovery(session(), origin);
  const privateMarker = 'ASSINATURA_PRIVADA_QUE_NAO_PODE_VAZAR';
  const wallet: WalletConnection = {
    id: 'MetaMask:evm',
    name: 'MetaMask',
    ecosystem: 'evm',
    identity: () =>
      Promise.resolve({
        ecosystem: 'evm',
        address: signer.address,
        chainId: 1,
      }),
    sign: () => Promise.reject(new Error(privateMarker)),
    observe: () => () => {},
  };
  await assert.rejects(
    signRecovery({ wallet, config, count: 1, current: () => {} }),
    (error: unknown) =>
      error instanceof Error && !error.message.includes(privateMarker),
  );
  await assert.rejects(
    walletRecoveryKey(config, [`0x${'ff'.repeat(65)}`]),
    (error: unknown) =>
      error instanceof Error && !error.message.includes('ffff'),
  );
});
