import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { Wallet } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import type { Ecosystem } from '../src/shared/wallet-identity/index.ts';
import { LoginOpening } from '../src/server/account/opening.ts';
import {
  openingRequest,
  openingTicket,
} from '../src/shared/wallet-opening/index.ts';
import {
  canonical,
  eventHash,
  verifyTransition,
} from '../src/shared/devices/index.ts';
import type { DirectoryEvent } from '../src/shared/devices/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import { object } from '../src/shared/account/index.ts';
import {
  prepareLoginOpening,
  rememberLoginOpening,
  signLoginOpening,
  loginOpeningTicket,
  acknowledgeLoginOpening,
  forgetLoginOpening,
} from '../src/client/wallet-opening/index.ts';
import { recoveryMessage } from '../src/shared/wallet-recovery/index.ts';
import { createIdentity } from '../src/client/device-keys/index.ts';
import { createWalletRecovery } from '../src/client/wallet-recovery/index.ts';
import { startDevices } from '../src/client/devices/index.ts';
import { DeviceController } from '../src/client/devices/controller.ts';
import { Contacts } from '../src/client/contacts/index.ts';
import type {
  WalletConnection,
  WalletName,
} from '../src/client/wallet/index.ts';
import { deviceDatabase } from './fixtures/device-database.ts';

const origin = 'https://0xdmme.app';
const signer = new Wallet(`0x${'1'.padStart(64, '0')}`);
const solanaSecret = new Uint8Array(32).fill(1);
const solanaAddress = base58.encode(ed25519.getPublicKey(solanaSecret));
function session(ecosystem: Ecosystem = 'evm'): AccountSession {
  return {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    ecosystem,
    address: ecosystem === 'evm' ? signer.address.toLowerCase() : solanaAddress,
    name: '',
    csrf: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    profileRevision: 0,
    walletConfirmed: true,
    deviceState: 'pending',
    historyAuthorized: false,
  };
}
function wallet(
  name: WalletName,
  ecosystem: Ecosystem = 'evm',
): WalletConnection {
  return {
    name,
    id: name,
    ecosystem,
    observe: () => () => {},
    identity: () =>
      Promise.resolve({
        ecosystem,
        address: ecosystem === 'evm' ? signer.address : solanaAddress,
        chainId: ecosystem === 'evm' ? 1 : 'solana:mainnet',
      }),
    sign: (message) =>
      ecosystem === 'evm'
        ? signer.signMessage(message)
        : Promise.resolve(
            base58.encode(
              ed25519.sign(new TextEncoder().encode(message), solanaSecret),
            ),
          ),
  };
}
function directoryFixture() {
  const events: DirectoryEvent[] = [];
  return async (url: string, input: Record<string, unknown>) => {
    const current = events.at(-1) ?? null;
    if (url.endsWith('/devices/read'))
      return {
        events: events.slice(input['after'] as number),
        revision: current?.revision ?? 0,
        head: current ? await eventHash(current) : null,
        serverTime: new Date().toISOString(),
      };
    if (!url.endsWith('/devices/commit')) return null;
    const next = await verifyTransition(current, input['event']);
    events.push(next);
    return { revision: next.revision, head: await eventHash(next) };
  };
}
function globals(t: TestContext) {
  const window = Object.assign(new EventTarget(), { setTimeout, clearTimeout }),
    records = new Map<string, string>();
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
  });
  const values = {
    window,
    document,
    location: { origin },
    indexedDB: deviceDatabase(),
    BroadcastChannel: undefined,
    localStorage: { getItem: () => 'MetaMask' },
    navigator: {
      onLine: true,
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          work: () => Promise<unknown>,
        ) => work(),
      },
    },
    sessionStorage: {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => records.set(key, value),
      removeItem: (key: string) => records.delete(key),
    },
  };
  for (const [name, value] of Object.entries(values)) {
    const before = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() =>
      before
        ? Object.defineProperty(globalThis, name, before)
        : Reflect.deleteProperty(globalThis, name),
    );
  }
  t.after(() => window.dispatchEvent(new Event('pagehide')));
  return { records, window, document };
}
for (const ecosystem of ['evm', 'solana'] as const)
  for (const name of ['MetaMask', 'Phantom', 'Backpack'] as const)
    await test(
      `${name}/${ecosystem}: primeira passagem entrega prova cifrada e libera configurações sem abrir wallet novamente`,
      { timeout: 10000 },
      async (t) => {
        const { records, window, document } = globals(t),
          user = session(ecosystem),
          server = new LoginOpening(origin);
        const receiver = await prepareLoginOpening(name);
        const ticket = await server.start(
          'original-browser',
          receiver,
          Date.now() + 300000,
        );
        await rememberLoginOpening(receiver, ticket);
        const request = server.prepare(ticket, user, null);
        assert.ok(request);
        assert.equal(request.transfer.count, 2);
        assert.equal(server.ready('original-browser'), false);
        assert.throws(() =>
          server.confirmation('original-browser', user, ticket),
        );
        const encrypted = await signLoginOpening({
          request,
          wallet: wallet(name, ecosystem),
          ticket,
          current: () => {},
        });
        const secret = await wallet(name, ecosystem).sign(
          recoveryMessage(request.transfer.config),
          user.address,
        );
        assert.equal(canonical(encrypted).includes(secret), false);
        assert.equal(
          [...records.values()].some((value) => value.includes(secret)),
          false,
        );
        await server.submit(encrypted);
        assert.equal(server.ready('original-browser'), true);
        assert.equal(
          server.confirmation('original-browser', user, ticket),
          user.accountId,
        );
        // A wallet/browser return can create another tab in the same browser.
        // Only its cookie plus the exact durable local receiver may finish.
        records.clear();
        assert.equal(await loginOpeningTicket(), ticket);
        server.bind('original-browser', user);
        const directory = directoryFixture();
        let activeSession = user;
        let mode = 'invite',
          revision = 0,
          configured = 0;
        t.mock.method(
          globalThis,
          'fetch',
          async (url: string, init: RequestInit) => {
            if (url.endsWith('/profile')) return Response.json(null);
            const input = object(JSON.parse(init.body as string) as unknown);
            if (url.endsWith('/opening-read'))
              return Response.json(server.read(activeSession, input));
            if (url.endsWith('/opening-ack')) {
              server.acknowledge(activeSession, input);
              return Response.json({ status: 'acknowledged' });
            }
            const result = await directory(url, input);
            if (result) return Response.json(result);
            if (url.endsWith('/contacts/configure')) {
              configured++;
              mode = object(input['payload'])['mode'] as string;
              revision++;
            }
            if (url.includes('/contacts/'))
              return Response.json({ revision, mode, inviteHash: null });
            throw new Error('Unexpected API in opening fixture: ' + url);
          },
        );
        let opened = 0;
        t.mock.method(DeviceController.prototype, 'openWalletRecovery', () => {
          opened++;
        });
        let returned: () => void = () => {};
        const resumed = new Promise<void>((resolve) => {
          returned = resolve;
        });
        const devices = startDevices({
          changed: () => {
            returned();
            return Promise.resolve();
          },
        });
        devices.setSession(user);
        const contacts = new Contacts(devices);
        contacts.setSession(user);
        await assert.rejects(
          contacts.configure('wallet', null),
          /Autorize ou recupere/,
        );
        assert.equal(configured, 0);
        assert.ok(await devices.privateKey(user, 'login'));
        assert.equal(devices.authorized(), true);
        assert.equal(opened, 0);
        await contacts.configure('wallet', null);
        assert.equal(mode, 'wallet');
        assert.equal(configured, 1);
        assert.ok(await devices.privateKey(user, 'restore'));
        assert.equal(opened, 0);
        assert.equal(records.has('0xdmme:wallet-opening'), false);
        window.dispatchEvent(new Event('pagehide'));
        assert.equal(devices.authorized(), false);
        if (name === 'Phantom')
          document.dispatchEvent(new Event('visibilitychange'));
        else
          window.dispatchEvent(
            new Event(name === 'Backpack' ? 'pageshow' : 'focus'),
          );
        await resumed;
        assert.equal(devices.authorized(), true);
        assert.equal(opened, 0);
        if (name === 'Backpack' && ecosystem === 'solana') {
          const next = {
            ...user,
            deviceId: crypto.randomUUID(),
            csrf: 'b'.repeat(64),
          };
          const destination = await prepareLoginOpening(name);
          const nextTicket = await server.start(
            'original-browser',
            destination,
            Date.now() + 300000,
          );
          await rememberLoginOpening(destination, nextTicket);
          const recovery = server.prepare(
            nextTicket,
            next,
            request.transfer.config,
          );
          assert.ok(recovery);
          assert.equal(recovery.transfer.count, 1);
          await server.submit(
            await signLoginOpening({
              request: recovery,
              wallet: wallet(name, ecosystem),
              ticket: nextTicket,
              current: () => {},
            }),
          );
          server.bind('original-browser', next);
          activeSession = next;
          devices.setSession(next);
          assert.ok(await devices.privateKey(next, 'login'));
          assert.equal(opened, 0);
          const history = await directory('/devices/read', { after: 0 });
          assert.ok(history && 'events' in history);
          const latest = history.events.at(-1);
          assert.equal(latest?.devices.length, 2);
          assert.ok(
            latest?.devices.some((device) => device.id === user.deviceId),
          );
        }
      },
    );

await test('abertura rejeita troca de destinatário, sessão, wallet, replay e retorno ausente após reinício', async (t) => {
  globals(t);
  const user = session(),
    receiver = await prepareLoginOpening('MetaMask');
  const server = new LoginOpening(origin);
  const ticket = await server.start('browser', receiver, Date.now() + 300000);
  const request = server.prepare(
    ticket,
    user,
    createWalletRecovery(user, origin),
  );
  assert.ok(request);
  assert.equal(request.transfer.count, 1);
  const wrong = await createIdentity(crypto.randomUUID(), 'Outro');
  await assert.rejects(
    openingRequest({
      ...request,
      transfer: { ...request.transfer, receiver: wrong.public.wrapping },
    }),
  );
  await assert.rejects(
    signLoginOpening({
      request,
      wallet: wallet('Phantom'),
      ticket,
      current: () => {},
    }),
  );
  const encrypted = await signLoginOpening({
    request,
    wallet: wallet('MetaMask'),
    ticket,
    current: () => {},
  });
  await server.submit(encrypted);
  await assert.rejects(server.submit(encrypted));
  server.bind('browser', user);
  assert.throws(() =>
    server.read({ ...user, csrf: 'b'.repeat(64) }, { ticket }),
  );
  assert.throws(() =>
    server.read({ ...user, deviceId: crypto.randomUUID() }, { ticket }),
  );
  server.acknowledge(user, { ticket });
  assert.throws(() => server.read(user, { ticket }));
  assert.throws(() => server.confirmation('browser', user, ticket));
});

await test('restaurar sessão anterior não apaga o pedido novo recusado por sua vinculação de sessão', async (t) => {
  globals(t);
  const receiver = await prepareLoginOpening('MetaMask');
  const ticket = await openingTicket(receiver);
  await rememberLoginOpening(receiver, ticket);
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(new Response('{}', { status: 409 })),
  );
  await acknowledgeLoginOpening(session());
  assert.equal(await loginOpeningTicket(), ticket);
});

await test('ACK tardio e cancelamento antigo não removem o pedido substituto; expiração não é renovada pela leitura', async (t) => {
  const { records } = globals(t);
  const receiver = await prepareLoginOpening('Phantom');
  const ticket = await openingTicket(receiver);
  await rememberLoginOpening(receiver, ticket);
  let complete: (response: Response) => void = () => {};
  let submitted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    submitted = resolve;
  });
  t.mock.method(globalThis, 'fetch', () => {
    submitted();
    return new Promise<Response>((resolve) => {
      complete = resolve;
    });
  });
  const acknowledged = acknowledgeLoginOpening(session());
  await started;
  const next = { ...receiver, nonce: 'e'.repeat(64) };
  const replacement = await openingTicket(next);
  await rememberLoginOpening(next, replacement);
  complete(Response.json({ status: 'acknowledged' }));
  await acknowledged;
  await forgetLoginOpening(ticket);
  records.clear();
  assert.equal(await loginOpeningTicket(), replacement);
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 300001);
  assert.equal(await loginOpeningTicket(), undefined);
});

await test('abertura limita entradas concorrentes e encerra provas no prazo original', async (t) => {
  const identity = await createIdentity(crypto.randomUUID(), 'Destino');
  const server = new LoginOpening(origin);
  const expires = Date.now() + 300000;
  const attempts = await Promise.allSettled(
    Array.from({ length: 130 }, (_, index) =>
      server.start(
        'b' + index,
        {
          receiver: identity.public.wrapping,
          wallet: 'MetaMask',
          nonce: index.toString(16).padStart(64, '0'),
        },
        expires,
      ),
    ),
  );
  assert.equal(
    attempts.filter((result) => result.status === 'fulfilled').length,
    128,
  );
  const first = attempts[0];
  assert.ok(first?.status === 'fulfilled');
  t.mock.method(Date, 'now', () => expires + 1);
  assert.equal(server.expected(first.value), false);
  assert.equal(
    await openingTicket({
      receiver: identity.public.wrapping,
      wallet: 'MetaMask',
      nonce: '0'.repeat(64),
    }),
    first.value,
  );
});
