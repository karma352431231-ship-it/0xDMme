import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountSession } from '../src/shared/account/index.ts';
import { EnrollmentLinks } from '../src/server/device-enrollment/index.ts';
import { reserveOperationMemory } from '../src/server/memory-admission/index.ts';
import { createIdentity } from '../src/client/device-keys/index.ts';
import { sign, linkProof } from '../src/shared/devices/index.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';

function source() {
  const session: AccountSession = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: '',
    csrf: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    profileRevision: 0,
    walletConfirmed: true,
    deviceState: 'pending',
    historyAuthorized: false,
  };
  const payload = {
    id: crypto.randomUUID(),
    codeHash: 'b'.repeat(64),
    root: 'c'.repeat(64),
    head: 'd'.repeat(64),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    signature: 'e'.repeat(64),
  };
  return { session, payload };
}

function authorizedDevices() {
  return {
    enrollmentSource: () => Promise.resolve(),
    assertEnrollmentSource: () => Promise.resolve(),
    start: () =>
      Promise.resolve({
        expiresAt: new Date().toISOString(),
        serverTime: new Date().toISOString(),
      }),
  };
}

await test('independent invitations exceed 128 and pressure preserves the earlier invitation', async (t) => {
  let available = 67_108_864;
  t.mock.method(process, 'availableMemory', () => available);
  const links = new EnrollmentLinks(authorizedDevices());
  t.after(() => links.close());
  const entries = Array.from({ length: 140 }, source);
  await Promise.all(
    entries.map((entry) => links.create(entry.session, entry.payload)),
  );
  const first = entries[0]!;
  assert.equal(
    await links.pending(first.session, { id: first.payload.id }),
    null,
  );
  const last = entries.at(-1)!;
  assert.equal(
    await links.pending(last.session, { id: last.payload.id }),
    null,
  );
  await assert.rejects(links.pending(first.session, { id: last.payload.id }));
  available = 0;
  await assert.rejects(
    links.create(first.session, { ...first.payload, id: crypto.randomUUID() }),
  );
  assert.equal(
    await links.pending(first.session, { id: first.payload.id }),
    null,
  );
  available = 67_108_864;
  const replacement = { ...first.payload, id: crypto.randomUUID() };
  await links.create(first.session, replacement);
  await assert.rejects(links.pending(first.session, { id: first.payload.id }));
  assert.equal(
    await links.pending(first.session, { id: replacement.id }),
    null,
  );
  links.close();
  const release = reserveOperationMemory(available);
  assert.ok(release);
  release();
});

await test('shutdown during source validation cannot recreate an invitation or leak memory', async (t) => {
  const available = 1_048_576;
  t.mock.method(process, 'availableMemory', () => available);
  const held = deferred<void>();
  const links = new EnrollmentLinks({
    ...authorizedDevices(),
    enrollmentSource: () => held.promise,
  });
  t.after(() => links.close());
  const entry = source();
  const attempt = links.create(entry.session, entry.payload);
  links.close();
  held.resolve();
  await assert.rejects(attempt);
  const release = reserveOperationMemory(available);
  assert.ok(release);
  release();
});

await test('shutdown during receiver issuance cancels its session before durable linking', async (t) => {
  const available = 1_048_576;
  t.mock.method(process, 'availableMemory', () => available);
  const entry = source(),
    identity = await createIdentity(crypto.randomUUID(), 'Receiver');
  const devices = authorizedDevices();
  const start = t.mock.method(devices, 'start');
  const links = new EnrollmentLinks(devices);
  t.after(() => links.close());
  await links.create(entry.session, entry.payload);
  const code = {
    version: 1 as const,
    accountId: entry.session.accountId,
    id: crypto.randomUUID(),
    nonce: 'f'.repeat(64),
    expiresAt: entry.payload.expiresAt,
    device: identity.public,
  };
  const issued = deferred<{ sessionToken: string; session: AccountSession }>();
  const reached = deferred<void>(),
    cancelled: string[] = [];
  const attempt = links.join(
    {
      id: entry.payload.id,
      codeHash: entry.payload.codeHash,
      code,
      signature: await sign(identity.signing, linkProof(code)),
      proof: 'a'.repeat(64),
    },
    () => {
      reached.resolve();
      return issued.promise;
    },
    (token) => {
      cancelled.push(token);
      return Promise.resolve();
    },
  );
  try {
    await waitForBoundary(reached.promise);
  } finally {
    links.close();
    issued.resolve({
      sessionToken: 'synthetic-receiver',
      session: { ...entry.session, deviceId: identity.public.id },
    });
  }
  await assert.rejects(attempt);
  assert.deepEqual(cancelled, ['synthetic-receiver']);
  assert.equal(start.mock.callCount(), 0);
  const release = reserveOperationMemory(available);
  assert.ok(release);
  release();
});
