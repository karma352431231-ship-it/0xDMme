import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIdentity } from '../src/client/device-keys/index.ts';
import {
  enrollmentPayload,
  readEnrollment,
  enrollmentMac,
  verifyEnrollmentMac,
} from '../src/shared/device-enrollment/index.ts';
import { readQrPayload } from '../src/client/device-qr/index.ts';
import { requireWalletSession } from '../src/shared/account/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
await test('QR e código de vinculação são equivalentes e a prova impede substituição do destinatário', async () => {
  const identity = await createIdentity(crypto.randomUUID(), 'Sintético');
  const invitation = {
    version: 1 as const,
    id: crypto.randomUUID(),
    accountId: crypto.randomUUID(),
    root: 'a'.repeat(64),
    secret: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  };
  const payload = enrollmentPayload(invitation);
  assert.deepEqual(
    readEnrollment(readQrPayload(payload, 'enrollment')),
    invitation,
  );
  assert.throws(() => readQrPayload(payload, 'invitation'));
  const code = {
    version: 1 as const,
    accountId: invitation.accountId,
    id: crypto.randomUUID(),
    nonce: 'c'.repeat(64),
    expiresAt: invitation.expiresAt,
    device: identity.public,
  };
  const proof = await enrollmentMac(invitation.secret, code);
  await verifyEnrollmentMac(invitation.secret, code, proof);
  for (const changed of [
    { ...code, accountId: crypto.randomUUID() },
    { ...code, nonce: 'd'.repeat(64) },
    { ...code, device: { ...code.device, id: crypto.randomUUID() } },
    { ...code, expiresAt: new Date(Date.now() + 200_000).toISOString() },
  ])
    await assert.rejects(
      verifyEnrollmentMac(invitation.secret, changed, proof),
    );
  await assert.rejects(verifyEnrollmentMac('f'.repeat(64), code, proof));
});
await test('acesso sensível exige confirmação real da wallet da sessão', () => {
  const session: AccountSession = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: 'Sintético',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date().toISOString(),
    csrf: 'a'.repeat(64),
    profileRevision: 0,
  };
  assert.throws(() => requireWalletSession(session));
  assert.throws(() =>
    requireWalletSession({ ...session, walletConfirmed: false }),
  );
  requireWalletSession({ ...session, walletConfirmed: true });
});
