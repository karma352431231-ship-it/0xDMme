import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createIdentity,
  createRecovery,
  deviceSecrets,
  aesKey,
  newSecret,
  recoverSecrets,
} from '../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
  remainingIdentities,
} from '../src/client/device-operations/index.ts';
import {
  openBlock,
  openManifest,
  sealBlock,
  sealCommit,
} from '../src/client/vault-crypto/index.ts';
import { base64 } from '../src/shared/account/index.ts';
import { eventHash, sign, canonical } from '../src/shared/devices/index.ts';
import {
  blockLimit,
  bytesHash,
  commitHash,
  operationBytes,
  verifyCommit,
  verifySuccessor,
  vaultCommit,
  vaultChange,
} from '../src/shared/vault/index.ts';
import type { VaultChange } from '../src/shared/vault/index.ts';

await test('cofre: recuperação abre blocos históricos; assinatura, AAD e limites não aceitam adulterações', async (t) => {
  const accountId = crypto.randomUUID();
  const a = await createIdentity(crypto.randomUUID(), 'A');
  const b = await createIdentity(crypto.randomUUID(), 'B');
  const secret = newSecret();
  const recovery = await createRecovery(accountId, secret);
  const ring = freshKeyring(accountId);
  const initial = await prepareEvent({
    accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: recovery.signing,
    root: recovery.root,
    identities: [a.public],
    ring,
    profile: null,
  });
  const link = await prepareEvent({
    accountId,
    previous: initial,
    kind: 'link',
    signer: a.public.id,
    signing: a.signing,
    root: initial.root,
    identities: [a.public, b.public],
    ring,
    linkId: crypto.randomUUID(),
    profile: null,
  });
  const key = await aesKey(ring.keys[0] ?? '');
  const identity = { accountId, id: crypto.randomUUID(), epoch: 1 };
  const bytes = await sealBlock(key, identity, 'conteúdo privado sintético');
  const change: VaultChange = {
    version: 1,
    kind: 'contact',
    entity: crypto.randomUUID(),
    parents: [],
    label: 'Agenda fictícia',
  };
  const commit = await sealCommit({
    unsigned: {
      version: 1,
      ...identity,
      deviceId: a.public.id,
      directory: await eventHash(link),
      authorityRevision: 2,
      sequence: 1,
      previous: null,
      block: { hash: await bytesHash(bytes), bytes: bytes.length },
    },
    change,
    key,
    sign: (proof) => sign(a.signing, proof),
  });
  await t.test('formato, reserva e restauração autorizada', async () => {
    assert.deepEqual(await verifyCommit(commit, link), commit);
    await verifySuccessor(null, commit);
    assert.ok(operationBytes(commit) > bytes.length + 4096);
    assert.equal(JSON.stringify(commit).includes(change.label), false);
    const restored = await recoverSecrets(link, secret);
    assert.equal(
      await openBlock(await aesKey(restored.ring.keys[0] ?? ''), commit, bytes),
      'conteúdo privado sintético',
    );
    assert.deepEqual(await openManifest(key, commit), change);
    const bRing = await deviceSecrets(b, link);
    assert.equal(
      await openBlock(await aesKey(bRing.keys[0] ?? ''), commit, bytes),
      'conteúdo privado sintético',
    );
  });
  await t.test(
    'assinatura e cadeia vinculam conta, aparelho, época, sequência e ciphertext',
    async () => {
      for (const mutated of [
        { ...commit, accountId: crypto.randomUUID() },
        { ...commit, epoch: 2 },
        { ...commit, sequence: 2 },
        { ...commit, block: { ...commit.block, hash: '0'.repeat(64) } },
        {
          ...commit,
          manifest: {
            ...commit.manifest,
            iv: commit.manifest.iv.replace(
              /^./u,
              commit.manifest.iv.startsWith('A') ? 'B' : 'A',
            ),
          },
        },
      ])
        await assert.rejects(verifyCommit(mutated, link));
      await assert.rejects(verifySuccessor(commit, commit));
      await assert.rejects(
        verifySuccessor(null, {
          ...commit,
          previous: await commitHash(commit),
        }),
      );
      await assert.rejects(
        openBlock(key, { ...commit, id: crypto.randomUUID() }, bytes),
      );
      const corrupt = Uint8Array.from(bytes);
      corrupt[15] = (corrupt[15] ?? 0) ^ 1;
      await assert.rejects(openBlock(key, commit, corrupt));
      await assert.rejects(openManifest(await aesKey(newSecret()), commit));
    },
  );
  await t.test(
    'revogação conserva histórico e isola chaves de novos blocos',
    async () => {
      const nextRing = freshKeyring(accountId, ring);
      const revoked = await prepareEvent({
        accountId,
        previous: link,
        kind: 'revoke',
        signer: a.public.id,
        signing: a.signing,
        root: link.root,
        identities: remainingIdentities(link, b.public.id),
        ring: nextRing,
        profile: null,
      });
      const restored = await recoverSecrets(revoked, secret);
      assert.equal(restored.ring.keys.length, 2);
      assert.equal(
        await openBlock(
          await aesKey(restored.ring.keys[0] ?? ''),
          commit,
          bytes,
        ),
        'conteúdo privado sintético',
      );
      await assert.rejects(verifyCommit(commit, revoked));
      await assert.rejects(deviceSecrets(b, revoked));
      const fresh = { accountId, id: crypto.randomUUID(), epoch: 2 };
      const cipher = await sealBlock(
        await aesKey(nextRing.keys[1] ?? ''),
        fresh,
        'novo',
      );
      const reference = {
        ...commit,
        ...fresh,
        block: { hash: await bytesHash(cipher), bytes: cipher.length },
      };
      await assert.rejects(openBlock(key, reference, cipher));
    },
  );
  await t.test(
    'plaintext tem teto real de 3 MB e parser rejeita formatos ambíguos',
    async () => {
      assert.equal(
        (await sealBlock(key, identity, 'x'.repeat(3_000_000))).length,
        blockLimit,
      );
      await assert.rejects(sealBlock(key, identity, 'x'.repeat(3_000_001)));
      await assert.rejects(sealBlock(key, identity, ''));
      assert.throws(() => vaultCommit({ ...commit, version: 2 }));
      assert.throws(() => vaultCommit({ ...commit, extra: true }));
      assert.throws(() =>
        vaultCommit({
          ...commit,
          block: { ...commit.block, bytes: blockLimit + 1 },
        }),
      );
      assert.throws(() =>
        vaultChange({ ...change, parents: [commit.id, commit.id] }),
      );
      assert.throws(() => vaultChange({ ...change, kind: 'message' }));
      assert.equal(base64(commit.manifest.iv, 12).length, 12);
      assert.equal(canonical(vaultCommit(commit)), canonical(commit));
    },
  );
});
