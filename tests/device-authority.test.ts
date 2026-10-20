import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canonical,
  eventHash,
  identityOf,
  verifyHistory,
  verifyTransition,
} from '../src/shared/devices/index.ts';
import {
  createIdentity,
  createRecovery,
  deviceSecrets,
  newSecret,
  recoverSecrets,
} from '../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
  remainingIdentities,
  recoveryIdentities,
} from '../src/client/device-operations/index.ts';

await test('device authority: linking, clean recovery, revocation and integrity', async (t) => {
  const accountId = crypto.randomUUID();
  const first = await createIdentity(crypto.randomUUID(), 'Mac');
  const second = await createIdentity(crypto.randomUUID(), 'Segundo aparelho');
  const third = await createIdentity(crypto.randomUUID(), 'Recuperado');
  const secret = newSecret();
  const authority = await createRecovery(accountId, secret);
  const ring = freshKeyring(accountId);
  const genesis = await prepareEvent({
    accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: authority.signing,
    root: authority.root,
    identities: [first.public],
    ring,
    profile: null,
  });
  const link = await prepareEvent({
    accountId,
    previous: genesis,
    kind: 'link',
    signer: first.public.id,
    signing: first.signing,
    root: authority.root,
    identities: [first.public, second.public],
    ring,
    linkId: crypto.randomUUID(),
    profile: null,
  });
  const rotated = freshKeyring(accountId, ring);
  const revocation = await prepareEvent({
    accountId,
    previous: link,
    kind: 'revoke',
    signer: first.public.id,
    signing: first.signing,
    root: authority.root,
    identities: remainingIdentities(link, second.public.id),
    ring: rotated,
    profile: null,
  });

  await t.test(
    'two devices open the same keys with non-exportable private identities',
    async () => {
      assert.equal(first.signing.extractable, false);
      assert.equal(first.wrapping.extractable, false);
      assert.deepEqual(await deviceSecrets(first, link), ring);
      assert.deepEqual(await deviceSecrets(second, link), ring);
      assert.equal(
        (await verifyHistory([genesis, link], accountId))?.revision,
        2,
      );
      await assert.rejects(crypto.subtle.exportKey('pkcs8', first.wrapping));
    },
  );
  await t.test(
    'server cannot add devices alone, replace keys, inject another root or omit events',
    async () => {
      await assert.rejects(
        verifyTransition(genesis, {
          ...link,
          devices: [
            ...link.devices,
            { ...third.public, envelope: link.devices[0]?.envelope },
          ],
        }),
      );
      await assert.rejects(
        verifyTransition(genesis, {
          ...link,
          root: { ...authority.root, signing: third.public.signing },
        }),
      );
      const substituted = structuredClone(link);
      const target = substituted.devices.find(
        (device) => device.id === second.public.id,
      );
      assert.ok(target);
      target.wrapping = third.public.wrapping;
      await assert.rejects(verifyTransition(genesis, substituted));
      await assert.rejects(verifyHistory([genesis, revocation], accountId));
      await assert.rejects(verifyHistory([genesis, link], crypto.randomUUID()));
    },
  );
  await t.test(
    'revoked device retains the previous key but cannot open a new key or sign another authorization',
    async () => {
      assert.deepEqual(await deviceSecrets(second, link), ring);
      assert.deepEqual(await deviceSecrets(first, revocation), rotated);
      await assert.rejects(deviceSecrets(second, revocation));
      assert.notEqual(rotated.keys[1], rotated.keys[0]);
      await assert.rejects(
        prepareEvent({
          accountId,
          previous: revocation,
          kind: 'link',
          signer: second.public.id,
          signing: second.signing,
          root: authority.root,
          identities: [first.public, third.public],
          ring: rotated,
          linkId: crypto.randomUUID(),
          profile: null,
        }),
      );
      await assert.rejects(
        prepareEvent({
          accountId,
          previous: revocation,
          kind: 'link',
          signer: first.public.id,
          signing: first.signing,
          root: authority.root,
          identities: [first.public, second.public],
          ring: rotated,
          linkId: crypto.randomUUID(),
          profile: null,
        }),
      );
    },
  );
  await t.test(
    'wrong secret and altered capsule fail; recovery without previous state replaces keys',
    async () => {
      await assert.rejects(
        recoverSecrets(revocation, newSecret()),
        /Recovery rejected/,
      );
      const corrupted = structuredClone(revocation);
      corrupted.root.capsule.ciphertext = `${corrupted.root.capsule.ciphertext[0] === 'A' ? 'B' : 'A'}${corrupted.root.capsule.ciphertext.slice(1)}`;
      await assert.rejects(recoverSecrets(corrupted, secret));
      const recovered = await recoverSecrets(
        JSON.parse(canonical(revocation)) as typeof revocation,
        secret,
      );
      assert.deepEqual(recovered.ring, rotated);
      const next = freshKeyring(accountId, recovered.ring);
      const restored = await prepareEvent({
        accountId,
        previous: revocation,
        kind: 'recover',
        signer: 'recovery',
        signing: recovered.signing,
        root: authority.root,
        identities: [third.public],
        ring: next,
        profile: null,
      });
      assert.deepEqual(await deviceSecrets(third, restored), next);
      assert.deepEqual((await recoverSecrets(restored, secret)).ring, next);
      await assert.rejects(deviceSecrets(first, restored));
      assert.equal(restored.epoch, 3);
      assert.equal(restored.previous, await eventHash(revocation));
      assert.deepEqual(restored.devices.map(identityOf), [third.public]);
      assert.equal(
        (await verifyHistory([genesis, link, revocation, restored], accountId))
          ?.revision,
        4,
      );
    },
  );
  await t.test(
    'recovery retains all or revokes only the selection without reactivating identifiers',
    async () => {
      const recovered = await recoverSecrets(link, secret);
      for (const revoked of [
        [],
        [second.public.id],
        [first.public.id, second.public.id],
      ]) {
        const next = freshKeyring(accountId, recovered.ring);
        const event = await prepareEvent({
          accountId,
          previous: link,
          kind: 'recover',
          signer: 'recovery',
          signing: recovered.signing,
          root: authority.root,
          identities: [...recoveryIdentities(link, revoked), third.public],
          ring: next,
          profile: null,
        });
        for (const identity of [first, second]) {
          if (revoked.includes(identity.public.id))
            await assert.rejects(deviceSecrets(identity, event));
          else assert.deepEqual(await deviceSecrets(identity, event), next);
        }
        assert.deepEqual(await deviceSecrets(third, event), next);
        assert.deepEqual(event.revoked, [...revoked].sort());
        assert.equal(
          (await verifyHistory([genesis, link, event], accountId))?.revision,
          3,
        );
      }
      assert.throws(() => recoveryIdentities(link, [crypto.randomUUID()]));
      assert.throws(() =>
        recoveryIdentities(link, [first.public.id, first.public.id]),
      );
      await assert.rejects(
        prepareEvent({
          accountId,
          previous: revocation,
          kind: 'recover',
          signer: 'recovery',
          signing: recovered.signing,
          root: authority.root,
          identities: [first.public, second.public, third.public],
          ring: freshKeyring(accountId, rotated),
          profile: null,
        }),
      );
    },
  );
});
