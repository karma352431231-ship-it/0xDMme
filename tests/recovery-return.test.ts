import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Wallet } from 'ethers';
import type { AccountSession } from '../src/shared/account/index.ts';
import { canonical, digest } from '../src/shared/devices/index.ts';
import {
  recoveryEntry,
  transferContext,
  recoveryMessage,
} from '../src/shared/wallet-recovery/index.ts';
import { RecoveryReturn } from '../src/server/recovery-return/index.ts';
import {
  createIdentity,
  openFrom,
  sealTo,
} from '../src/client/device-keys/index.ts';
import { createWalletRecovery } from '../src/client/wallet-recovery/index.ts';
import {
  requestRecovery,
  receiveRecovery,
  rememberRecovery,
  readRecovery,
} from '../src/client/recovery-return/index.ts';
import type { RecoveryFlow } from '../src/client/recovery-return/index.ts';
import { cacheableRequest } from '../src/shared/pwa-policy/index.ts';

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
await test('retorno opaco vincula conta/aparelho/sessão/destino; rejeita replay, adulteração, expiração e assinatura em claro', async (t) => {
  let now = Date.now();
  const relay = new RecoveryReturn(origin, () => now);
  t.after(() => relay.close());
  const user = session();
  const identity = await createIdentity(user.deviceId, 'Destino');
  const wrong = await createIdentity(crypto.randomUUID(), 'Outro');
  const config = createWalletRecovery(user, origin);
  const input = {
    config,
    wallet: 'MetaMask',
    receiver: identity.public.wrapping,
    count: 2,
  };
  const receipt = await relay.start(user, input);
  const entry = { ticket: receipt.ticket, commitment: receipt.commitment };
  const transfer = relay.requestPublic(entry).transfer;
  assert.equal(await digest(canonical(transfer)), entry.commitment);
  const signatures = [
    await signer.signMessage(recoveryMessage(config)),
    await signer.signMessage(recoveryMessage(config)),
  ];
  const envelope = await sealTo(
    transfer.receiver,
    { signatures },
    transferContext(transfer),
  );
  assert.equal(canonical(envelope).includes(signatures[0] ?? ''), false);
  assert.throws(() => relay.submit({ ...entry, signatures }));
  assert.throws(() =>
    relay.submit({ ...entry, envelope, signature: signatures[0] }),
  );
  assert.throws(() =>
    relay.take({ ...user, deviceId: wrong.public.id }, entry),
  );
  assert.throws(() =>
    relay.take({ ...user, accountId: crypto.randomUUID() }, entry),
  );
  assert.throws(() => relay.take({ ...user, csrf: 'b'.repeat(64) }, entry));
  assert.throws(() =>
    relay.requestPublic({ ...entry, commitment: '0'.repeat(64) }),
  );
  assert.equal(relay.take(user, entry).envelope, null);
  await assert.rejects(
    openFrom(wrong.wrapping, envelope, transferContext(transfer)),
  );
  await assert.rejects(
    openFrom(
      identity.wrapping,
      envelope,
      transferContext({ ...transfer, count: 1 }),
    ),
  );
  await assert.rejects(
    openFrom(
      identity.wrapping,
      { ...envelope, iv: 'A'.repeat(16) },
      transferContext(transfer),
    ),
  );
  relay.submit({ ...entry, envelope });
  assert.throws(() => relay.submit({ ...entry, envelope }));
  const taken = relay.take(user, entry).envelope;
  assert.ok(taken);
  assert.deepEqual(
    await openFrom(identity.wrapping, taken, transferContext(transfer)),
    { signatures },
  );
  assert.throws(() => relay.take(user, entry));
  const canceled = await relay.start(user, input);
  relay.cancel(user, {
    ticket: canceled.ticket,
    commitment: canceled.commitment,
  });
  assert.throws(() =>
    relay.requestPublic({
      ticket: canceled.ticket,
      commitment: canceled.commitment,
    }),
  );
  const expired = await relay.start(user, input);
  now += 300_000;
  assert.throws(() =>
    relay.requestPublic({
      ticket: expired.ticket,
      commitment: expired.commitment,
    }),
  );
  await assert.rejects(
    relay.start(user, {
      ...input,
      config: { ...config, origin: 'https://other.example' },
    }),
  );
  await assert.rejects(
    relay.start(user, {
      ...input,
      config: {
        ...config,
        address: new Wallet(`0x${'2'.padStart(64, '0')}`).address.toLowerCase(),
      },
    }),
  );
});
await test('128 pedidos concorrentes respeitam orçamento; novo pedido cancela anterior sem renovar tombstone', async (t) => {
  let now = Date.now();
  const relay = new RecoveryReturn(origin, () => now);
  t.after(() => relay.close());
  const user = session();
  const identity = await createIdentity(user.deviceId, 'A');
  const input = {
    config: createWalletRecovery(user, origin),
    wallet: 'MetaMask',
    receiver: identity.public.wrapping,
    count: 1,
  };
  const prior = await relay.start(user, input);
  const requests = await Promise.allSettled(
    Array.from({ length: 130 }, () => relay.start(user, input)),
  );
  assert.equal(
    requests.filter((result) => result.status === 'fulfilled').length,
    127,
  );
  assert.equal(
    requests.filter((result) => result.status === 'rejected').length,
    3,
  );
  assert.throws(() =>
    relay.requestPublic({ ticket: prior.ticket, commitment: prior.commitment }),
  );
  now += 300_000;
  const fresh = await relay.start(user, input);
  assert.ok(
    relay.requestPublic({ ticket: fresh.ticket, commitment: fresh.commitment }),
  );
});
await test('cliente recusa substituição do destino e retoma apenas metadados públicos após reload', async (t) => {
  const user = session();
  const identity = await createIdentity(user.deviceId, 'A');
  const config = createWalletRecovery(user, origin);
  const relay = new RecoveryReturn(origin);
  t.after(() => relay.close());
  const records = new Map<string, string>();
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin },
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => records.set(key, value),
      removeItem: (key: string) => records.delete(key),
    },
  });
  t.after(() => {
    Reflect.deleteProperty(globalThis, 'location');
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
  t.mock.method(globalThis, 'fetch', (url: string, options: RequestInit) => {
    assert.equal(typeof options.body, 'string');
    const input = JSON.parse(options.body as string) as unknown;
    if (url.endsWith('start'))
      return relay.start(user, input).then((value) => Response.json(value));
    return Promise.resolve(Response.json(relay.take(user, input)));
  });
  const pending = await requestRecovery({
    session: user,
    identity,
    config,
    wallet: 'MetaMask',
    count: 2,
  });
  assert.ok(pending.link.includes(pending.commitment));
  const flow: RecoveryFlow = {
    mode: 'initialize',
    config,
    name: 'A',
    revoked: [],
    revision: 0,
    head: null,
    pending,
  };
  rememberRecovery(user, flow);
  assert.deepEqual(await readRecovery(user, identity.public.wrapping), flow);
  const signature = await signer.signMessage(recoveryMessage(config));
  for (const stored of records.values()) {
    assert.equal(stored.includes(signature), false);
    assert.equal(stored.includes('privateKey'), false);
  }
  const entry = {
    ticket: pending.transfer.ticket,
    commitment: pending.commitment,
  };
  relay.submit({
    ...entry,
    envelope: await sealTo(
      identity.public.wrapping,
      { signatures: [signature, signature] },
      transferContext(pending.transfer),
    ),
  });
  assert.deepEqual(
    await receiveRecovery({ session: user, identity, pending }),
    [signature, signature],
  );
  rememberRecovery(user, {
    ...flow,
    pending: { ...pending, link: 'https://link.metamask.io/dapp/evil.example' },
  });
  assert.equal(await readRecovery(user, identity.public.wrapping), null);
  rememberRecovery(user, flow);
  const other = await createIdentity(crypto.randomUUID(), 'B');
  assert.equal(await readRecovery(user, other.public.wrapping), null);
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(
      Response.json({
        ticket: 'a'.repeat(64),
        commitment: 'b'.repeat(64),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        serverTime: new Date().toISOString(),
      }),
    ),
  );
  await assert.rejects(
    requestRecovery({
      session: user,
      identity,
      config,
      wallet: 'MetaMask',
      count: 2,
    }),
    /destino/,
  );
});
await test('entrada privada tem URL estrita e fica fora do cache PWA mesmo com allowlist adulterada', () => {
  const path = `/recovery-entry/${'a'.repeat(64)}/${'b'.repeat(64)}`;
  assert.ok(recoveryEntry(path));
  assert.equal(recoveryEntry(`${path}?destination=evil`), null);
  for (const entry of [path, '/recovery.html'])
    assert.equal(
      cacheableRequest(new Request(`${origin}${entry}`), origin, [entry]),
      false,
    );
});
