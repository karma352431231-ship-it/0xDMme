import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { base58 } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519';
import pg from 'pg';
import { Wallet } from 'ethers';
import { Database } from '../../src/server/database/index.ts';
import {
  AccountService,
  createAccountHandler,
} from '../../src/server/account/index.ts';
import { createWebServer } from '../../src/server/web-host/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  AccountError,
  accountReservation,
} from '../../src/shared/account/index.ts';
import {
  emptyProfile,
  openProfile,
  sealProfile,
} from '../../src/client/account-profile/index.ts';

const config = readWebConfiguration(process.env);
if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
  throw new Error('Banco de teste exclusivo necessário.');
const database = new Database(config.databaseUrl);
const inspector = new pg.Client({ connectionString: config.databaseUrl });
const origin = 'http://127.0.0.1:45110';
const service = new AccountService({
  store: database.authentication,
  origin,
  capacity: config.accountCapacityBytes,
});
const ownAddresses: string[] = [];
function freshHttpAccount() {
  return createAccountHandler({
    origin,
    service,
    approvalDocument: new TextEncoder().encode(
      '<html><head><title>Aprovar</title></head><body>Documento próprio</body></html>',
    ),
  });
}
let httpAccount = freshHttpAccount();
const host = createWebServer({
  origin,
  assets: new Map(),
  database,
  objects: { healthy: () => Promise.resolve(true) },
  account: {
    handle: (request, response) => httpAccount.handle(request, response),
    close: () => httpAccount.close(),
  },
});

function wallet() {
  const created = Wallet.createRandom();
  ownAddresses.push(created.address.toLowerCase());
  return created;
}
async function requestChallenge(
  signer: ReturnType<typeof wallet>,
  selected = service,
) {
  return selected.challenge({
    address: signer.address,
    chainId: 1,
    deviceId: randomUUID(),
  });
}
async function authenticate(
  signer: ReturnType<typeof wallet>,
  selected = service,
) {
  const challenge = await requestChallenge(signer, selected);
  return selected.login(
    {
      id: challenge.id,
      signature: await signer.signMessage(challenge.message),
    },
    challenge.browserToken,
  );
}
function unauthorized(error: unknown): boolean {
  return error instanceof AccountError && error.status === 401;
}

// fetch fixes Sec-Fetch-Mode to cors; real document navigation uses navigate.
function navigateEntry(path: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      `${origin}${path}`,
      {
        headers: {
          'Sec-Fetch-Site': 'cross-site',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Dest': 'document',
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const headers = new Headers();
          for (let i = 0; i < response.rawHeaders.length; i += 2) {
            const key = response.rawHeaders[i];
            const value = response.rawHeaders[i + 1];
            if (key !== undefined && value !== undefined)
              headers.append(key, value);
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode ?? 503,
              headers,
            }),
          );
        });
        response.on('error', reject);
      },
    );
    request.on('error', reject);
    request.end();
  });
}

await test('Autenticação e perfil persistentes', async (t) => {
  await database.migrate();
  await inspector.connect();
  await new Promise<void>((resolve, reject) => {
    host.server.once('error', reject);
    host.server.listen(45110, '127.0.0.1', resolve);
  });

  t.after(async () => {
    await host.close();
    // Only identities created by this run, never truncate or touch dev/user data.
    await inspector.query('BEGIN');
    try {
      await inspector.query(
        'SELECT singleton FROM hash_talk.account_capacity WHERE singleton FOR UPDATE',
      );
      const accounts = await inspector.query<{ id: string }>(
        'SELECT id FROM hash_talk.accounts WHERE address = ANY($1::text[])',
        [ownAddresses],
      );
      const ids = accounts.rows.map((row) => row.id);
      await inspector.query(
        'DELETE FROM hash_talk.login_sessions WHERE account_id = ANY($1::uuid[])',
        [ids],
      );
      await inspector.query(
        'DELETE FROM hash_talk.login_devices WHERE account_id = ANY($1::uuid[])',
        [ids],
      );
      await inspector.query(
        'DELETE FROM hash_talk.accounts WHERE id = ANY($1::uuid[])',
        [ids],
      );
      await inspector.query(
        'DELETE FROM hash_talk.login_challenges WHERE address = ANY($1::text[])',
        [ownAddresses],
      );
      await inspector.query(
        'UPDATE hash_talk.account_capacity SET reserved_bytes = reserved_bytes - $1 WHERE singleton',
        [ids.length * accountReservation],
      );
      await inspector.query('COMMIT');
    } catch (error: unknown) {
      await inspector.query('ROLLBACK');
      throw error;
    } finally {
      await inspector.end();
      await database.close();
    }
  });

  await t.test(
    'login atômico aceita apenas uma verificação concorrente, preserva conta e deixa histórico bloqueado',
    async () => {
      const signer = wallet();
      const challenge = await requestChallenge(signer);
      const signature = await signer.signMessage(challenge.message);
      const attempts = await Promise.allSettled([
        service.login({ id: challenge.id, signature }, challenge.browserToken),
        service.login({ id: challenge.id, signature }, challenge.browserToken),
      ]);
      const fulfilled = attempts.filter((item) => item.status === 'fulfilled');
      assert.equal(fulfilled.length, 1);
      assert.ok(
        attempts.some(
          (item) => item.status === 'rejected' && unauthorized(item.reason),
        ),
      );
      const login = fulfilled[0];
      assert.ok(login && login.status === 'fulfilled');
      assert.equal(login.value.session.historyAuthorized, false);
      assert.equal(login.value.session.deviceState, 'pending');
      assert.equal(login.value.session.profileRevision, 0);
      await assert.rejects(
        service.login({ id: challenge.id, signature }, challenge.browserToken),
        unauthorized,
      );
      await service.rename(login.value.sessionToken, {
        name: 'Nome sintético',
      });
      await service.logout(login.value.sessionToken);
      await assert.rejects(
        service.session(login.value.sessionToken),
        unauthorized,
      );
      const next = await authenticate(signer);
      assert.equal(next.session.accountId, login.value.session.accountId);
      assert.equal(next.session.name, 'Nome sintético');
      const row = await inspector.query<{ reserved_bytes: string }>(
        'SELECT reserved_bytes FROM hash_talk.accounts WHERE id = $1',
        [next.session.accountId],
      );
      assert.equal(Number(row.rows[0]?.reserved_bytes), accountReservation);
    },
  );

  await t.test(
    'assinatura de outro domínio, outra wallet, cookie trocado e desafio expirado são recusados',
    async () => {
      const signer = wallet();
      const other = wallet();
      const challenge = await requestChallenge(signer);
      const wrongDomain = challenge.message.replace(
        origin,
        'http://wrong.example',
      );
      await assert.rejects(
        service.login(
          {
            id: challenge.id,
            signature: await signer.signMessage(wrongDomain),
          },
          challenge.browserToken,
        ),
        unauthorized,
      );
      await assert.rejects(
        service.login(
          {
            id: challenge.id,
            signature: await other.signMessage(challenge.message),
          },
          challenge.browserToken,
        ),
        unauthorized,
      );
      const signature = await signer.signMessage(challenge.message);
      await assert.rejects(
        service.login({ id: challenge.id, signature }, 'a'.repeat(64)),
        unauthorized,
      );
      await inspector.query(
        "UPDATE hash_talk.login_challenges SET expires_at = now() - interval '1 second' WHERE id = $1",
        [challenge.id],
      );
      await assert.rejects(
        service.login({ id: challenge.id, signature }, challenge.browserToken),
        unauthorized,
      );
      const exhausted = await requestChallenge(signer);
      for (let attempt = 0; attempt < 3; attempt++)
        await assert.rejects(
          service.login(
            { id: exhausted.id, signature: `0x${'0'.repeat(130)}` },
            exhausted.browserToken,
          ),
          unauthorized,
        );
      await assert.rejects(
        service.login(
          {
            id: exhausted.id,
            signature: await signer.signMessage(exhausted.message),
          },
          exhausted.browserToken,
        ),
        unauthorized,
      );
    },
  );

  await t.test(
    'reserva global recusa nova conta e reverte consumo do desafio sem bloquear conta existente',
    async () => {
      const capacity = await inspector.query<{ reserved_bytes: string }>(
        'SELECT reserved_bytes FROM hash_talk.account_capacity WHERE singleton',
      );
      const capped = new AccountService({
        store: database.authentication,
        origin,
        capacity: Number(capacity.rows[0]?.reserved_bytes),
      });
      const signer = wallet();
      const challenge = await requestChallenge(signer, capped);
      const signature = await signer.signMessage(challenge.message);
      await assert.rejects(
        capped.login({ id: challenge.id, signature }, challenge.browserToken),
        (error: unknown) =>
          error instanceof AccountError && error.status === 503,
      );
      const retry = await service.login(
        { id: challenge.id, signature },
        challenge.browserToken,
      );
      const existing = await authenticate(signer, capped);
      assert.equal(existing.session.accountId, retry.session.accountId);
    },
  );

  await t.test(
    'cadastros simultâneos respeitam última reserva e sessão expirada não autoriza escrita',
    async () => {
      const current = await inspector.query<{ reserved_bytes: string }>(
        'SELECT reserved_bytes FROM hash_talk.account_capacity WHERE singleton',
      );
      const capped = new AccountService({
        store: database.authentication,
        origin,
        capacity: Number(current.rows[0]?.reserved_bytes) + accountReservation,
      });
      const results = await Promise.allSettled([
        authenticate(wallet(), capped),
        authenticate(wallet(), capped),
      ]);
      const success = results.filter((item) => item.status === 'fulfilled');
      assert.equal(success.length, 1);
      assert.ok(
        results.some(
          (item) =>
            item.status === 'rejected' &&
            item.reason instanceof AccountError &&
            item.reason.status === 503,
        ),
      );
      const loggedIn = success[0];
      assert.ok(loggedIn && loggedIn.status === 'fulfilled');
      await inspector.query(
        "UPDATE hash_talk.login_sessions SET expires_at = now() - interval '1 second' WHERE account_id = $1",
        [loggedIn.value.session.accountId],
      );
      await assert.rejects(
        capped.session(loggedIn.value.sessionToken),
        unauthorized,
      );
      await assert.rejects(
        capped.rename(loggedIn.value.sessionToken, { name: 'Expirada' }),
        unauthorized,
      );
    },
  );

  await t.test(
    'perfil remoto permanece opaco, exige revisão seguinte, e outra wallet não o lê',
    async () => {
      const signer = wallet();
      const login = await authenticate(signer);
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
      const profile = emptyProfile();
      profile.preferences.online = true;
      const envelope = await sealProfile({
        profile,
        key,
        accountId: login.session.accountId,
        revision: 1,
      });
      await service.saveProfile(login.sessionToken, envelope);
      const stored = await service.profile(login.sessionToken);
      assert.ok(stored);
      assert.deepEqual(
        await openProfile({
          envelope: stored,
          key,
          accountId: login.session.accountId,
        }),
        profile,
      );
      await assert.rejects(
        service.saveProfile(login.sessionToken, envelope),
        (error: unknown) =>
          error instanceof AccountError && error.status === 409,
      );
      const other = await authenticate(wallet());
      assert.equal(await service.profile(other.sessionToken), null);
      assert.equal(
        (await service.session(login.sessionToken)).historyAuthorized,
        false,
      );
      const bytes = await inspector.query<{ profile_ciphertext: Buffer }>(
        'SELECT profile_ciphertext FROM hash_talk.accounts WHERE id = $1',
        [login.session.accountId],
      );
      assert.equal(
        bytes.rows[0]?.profile_ciphertext.includes(Buffer.from('preferences')),
        false,
      );
    },
  );

  await t.test(
    'Solana preserva endereço e conta, rejeita replay, outra chave, prefixo e chaves de baixa ordem',
    async () => {
      const secret = ed25519.utils.randomPrivateKey();
      const address = base58.encode(ed25519.getPublicKey(secret));
      ownAddresses.push(address);
      const input = {
        address,
        ecosystem: 'solana',
        chainId: 'solana:mainnet',
        deviceId: randomUUID(),
      };
      const challenge = await service.challenge(input);
      const signature = base58.encode(
        ed25519.sign(new TextEncoder().encode(challenge.message), secret),
      );
      const wrong = base58.encode(
        ed25519.sign(
          new TextEncoder().encode(challenge.message),
          ed25519.utils.randomPrivateKey(),
        ),
      );
      await assert.rejects(
        service.login(
          { id: challenge.id, signature: wrong },
          challenge.browserToken,
        ),
        unauthorized,
      );
      const prefixed = base58.encode(
        ed25519.sign(
          new TextEncoder().encode(`prefix:${challenge.message}`),
          secret,
        ),
      );
      await assert.rejects(
        service.login(
          { id: challenge.id, signature: prefixed },
          challenge.browserToken,
        ),
        unauthorized,
      );
      const logged = await service.login(
        { id: challenge.id, signature },
        challenge.browserToken,
      );
      assert.equal(logged.session.ecosystem, 'solana');
      assert.equal(logged.session.address, address);
      assert.equal(logged.session.historyAuthorized, false);
      await assert.rejects(
        service.login({ id: challenge.id, signature }, challenge.browserToken),
        unauthorized,
      );
      const next = await service.challenge(input);
      const repeat = await service.login(
        {
          id: next.id,
          signature: base58.encode(
            ed25519.sign(new TextEncoder().encode(next.message), secret),
          ),
        },
        next.browserToken,
      );
      assert.equal(repeat.session.accountId, logged.session.accountId);
      await assert.rejects(service.challenge({ ...input, ecosystem: 'evm' }));
      await assert.rejects(
        service.challenge({
          ...input,
          address: base58.encode(
            Uint8Array.from([1, ...new Array<number>(31).fill(0)]),
          ),
        }),
      );
      await assert.rejects(
        service.challenge({ ...input, address: '1'.repeat(32) }),
      );
      await assert.rejects(
        service.challenge({ ...input, chainId: 'solana:devnet' }),
      );
      const expired = await service.challenge(input);
      await inspector.query(
        "UPDATE hash_talk.login_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",
        [expired.id],
      );
      await assert.rejects(
        service.login(
          {
            id: expired.id,
            signature: base58.encode(
              ed25519.sign(new TextEncoder().encode(expired.message), secret),
            ),
          },
          expired.browserToken,
        ),
        unauthorized,
      );
      const rows = await inspector.query<{ ecosystem: string }>(
        'SELECT ecosystem FROM hash_talk.accounts WHERE id=$1',
        [logged.session.accountId],
      );
      assert.equal(rows.rows[0]?.ecosystem, 'solana');
    },
  );

  await t.test(
    'retorno exige assinatura, cookie original e confirmação exata; não cria sessão na wallet e é atômico',
    async () => {
      const signer = wallet();
      const deviceId = randomUUID();
      const pending = await service.startHandoff(
        { ecosystem: 'evm', deviceId },
        '',
      );
      const approval = {
        ticket: pending.ticket,
        wallet: 'MetaMask',
        ecosystem: 'evm',
      };
      const recovered = await service.approvalRequest(approval);
      assert.equal(recovered.expiresAt, pending.expiresAt);
      await assert.rejects(
        service.approvalRequest({ ...approval, ecosystem: 'solana' }),
        unauthorized,
      );
      const challenge = await service.handoffChallenge({
        ticket: pending.ticket,
        address: signer.address,
        chainId: 1,
      });
      const signature = await signer.signMessage(challenge.message);
      const confirmed = {
        ecosystem: 'evm',
        address: signer.address.toLowerCase(),
      };
      assert.equal(
        (await service.handoffStatus(pending.browserToken))?.address,
        null,
      );
      await assert.rejects(
        service.finishHandoff(confirmed, pending.browserToken),
        unauthorized,
      );
      await assert.rejects(
        service.login({ id: challenge.id, signature }, challenge.browserToken),
        unauthorized,
      );
      await service.signHandoff(
        { ticket: pending.ticket, id: challenge.id, signature },
        challenge.browserToken,
      );
      await assert.rejects(service.approvalRequest(approval), unauthorized);
      const state = await service.handoffStatus(pending.browserToken);
      assert.equal(state?.address, signer.address.toLowerCase());
      const walletSessions = await inspector.query<{ total: number }>(
        `SELECT count(*)::integer AS total FROM hash_talk.login_sessions s JOIN hash_talk.accounts a ON a.id=s.account_id WHERE a.address=$1`,
        [signer.address.toLowerCase()],
      );
      assert.equal(walletSessions.rows[0]?.total, 0);
      await assert.rejects(
        service.signHandoff(
          { ticket: pending.ticket, id: challenge.id, signature },
          challenge.browserToken,
        ),
        unauthorized,
      );
      await assert.rejects(
        service.finishHandoff(confirmed, 'a'.repeat(64)),
        unauthorized,
      );
      await assert.rejects(
        service.finishHandoff(
          { ...confirmed, address: wallet().address },
          pending.browserToken,
        ),
        unauthorized,
      );
      const result = await Promise.allSettled([
        service.finishHandoff(confirmed, pending.browserToken),
        service.finishHandoff(confirmed, pending.browserToken),
      ]);
      const success = result.filter((item) => item.status === 'fulfilled');
      assert.equal(success.length, 1);
      const logged = success[0];
      assert.ok(logged?.status === 'fulfilled');
      assert.equal(logged.value.session.deviceId, deviceId);
      assert.equal(logged.value.session.historyAuthorized, false);
      assert.equal(await service.handoffStatus(pending.browserToken), null);
      await assert.rejects(
        service.handoffChallenge({
          ticket: pending.ticket,
          address: signer.address,
          chainId: 1,
        }),
        unauthorized,
      );
      const cancelled = await service.startHandoff(
        { ecosystem: 'evm', deviceId },
        '',
      );
      await service.cancelHandoff(cancelled.browserToken);
      await assert.rejects(
        service.approvalRequest({ ...approval, ticket: cancelled.ticket }),
        unauthorized,
      );
      await assert.rejects(
        service.handoffChallenge({
          ticket: cancelled.ticket,
          address: signer.address,
          chainId: 1,
        }),
        unauthorized,
      );
      const expired = await service.startHandoff(
        { ecosystem: 'evm', deviceId },
        '',
      );
      await inspector.query(
        "UPDATE hash_talk.login_handoffs SET expires_at=now()-interval '1 second' WHERE ticket_hash=encode(sha256($1::bytea),'hex')",
        [Buffer.from(expired.ticket)],
      );
      await assert.rejects(
        service.handoffChallenge({
          ticket: expired.ticket,
          address: signer.address,
          chainId: 1,
        }),
        unauthorized,
      );
      await service.cancelHandoff(expired.browserToken);
    },
  );

  await t.test(
    'retorno HTTP mantém cookies independentes e só entrega sessão após confirmação no navegador original',
    async () => {
      const signer = wallet();
      const headers = { Origin: origin, 'Content-Type': 'application/json' };
      async function post(path: string, input: unknown, cookie = '') {
        return fetch(`${origin}/api/account/${path}`, {
          method: 'POST',
          headers: { ...headers, Cookie: cookie },
          body: JSON.stringify(input),
        });
      }
      const start = await post('handoff-start', {
        ecosystem: 'evm',
        deviceId: randomUUID(),
      });
      assert.equal(start.status, 200);
      const originalCookie =
        start.headers.get('set-cookie')?.split(';')[0] ?? '';
      assert.match(
        start.headers.get('set-cookie') ?? '',
        /HttpOnly; SameSite=Strict/,
      );
      const pending = (await start.json()) as {
        ticket: string;
        expiresAt: string;
        serverTime: string;
      };
      const remaining =
        Date.parse(pending.expiresAt) - Date.parse(pending.serverTime);
      assert.ok(remaining > 0 && remaining <= 300_000);
      const inlinePath = `/wallet-entry?${new URLSearchParams({
        ticket: pending.ticket,
        wallet: 'Backpack',
        ecosystem: 'evm',
        view: 'page',
      })}`;
      const inline = await navigateEntry(inlinePath);
      assert.equal(inline.status, 200);
      assert.equal(inline.headers.get('location'), null);
      assert.equal(inline.headers.get('set-cookie'), null);
      assert.match(
        await inline.text(),
        /type="application\/json" id="xdmme-wallet-approval-request"/u,
      );
      const entry = await navigateEntry(
        `/wallet-entry?${new URLSearchParams({
          ticket: pending.ticket,
          wallet: 'MetaMask',
          ecosystem: 'evm',
          returnBrowser: 'chrome',
        })}`,
      );
      assert.equal(entry.status, 303);
      assert.equal(entry.headers.get('location'), '/wallet.html#configuracoes');
      assert.equal(entry.headers.get('cache-control'), 'no-store');
      assert.equal(entry.headers.get('referrer-policy'), 'no-referrer');
      assert.match(
        entry.headers.get('set-cookie') ?? '',
        /HttpOnly; SameSite=Lax; Max-Age=\d+/u,
      );
      const entryCookie = entry.headers.getSetCookie()[0]?.split(';')[0] ?? '';
      const recoveredResponse = await fetch(
        `${origin}/api/account/approval-request`,
        { headers: { Cookie: entryCookie } },
      );
      assert.equal(recoveredResponse.status, 200);
      const recoveredEntry = (await recoveredResponse.json()) as {
        request: { ticket: string; returnBrowser: string };
        expiresAt: string;
      };
      assert.equal(recoveredEntry.request.ticket, pending.ticket);
      assert.equal(recoveredEntry.request.returnBrowser, 'chrome');
      assert.equal(recoveredEntry.expiresAt, pending.expiresAt);
      const status = await fetch(`${origin}/api/account/handoff-status`, {
        headers: { Cookie: originalCookie },
      });
      assert.equal(status.status, 200);
      const state = (await status.json()) as {
        expiresAt: string;
        serverTime: string;
        address: string | null;
      };
      assert.equal(state.expiresAt, pending.expiresAt);
      assert.equal(state.address, null);
      assert.ok(Date.parse(state.serverTime) >= Date.parse(pending.serverTime));
      const response = await post('handoff-challenge', {
        ticket: pending.ticket,
        address: signer.address,
        chainId: 1,
      });
      assert.equal(response.status, 200);
      const walletCookie =
        response.headers.get('set-cookie')?.split(';')[0] ?? '';
      const challenge = (await response.json()) as {
        id: string;
        message: string;
      };
      const signed = await post(
        'handoff-sign',
        {
          ticket: pending.ticket,
          id: challenge.id,
          signature: await signer.signMessage(challenge.message),
        },
        `${walletCookie}; ${entryCookie}`,
      );
      assert.equal(signed.status, 200);
      await signed.text();
      assert.equal(
        signed.headers
          .getSetCookie()
          .some((item) => item.startsWith('0xdmme-approval=')),
        false,
      );
      const replay = await fetch(`${origin}/api/account/approval-request`, {
        headers: { Cookie: entryCookie },
      });
      assert.equal(replay.status, 401);
      const usedDocument = await navigateEntry(inlinePath);
      assert.equal(usedDocument.status, 303);
      assert.equal(
        usedDocument.headers.get('location'),
        '/wallet.html#configuracoes?invalid=1&reason=unavailable',
      );
      assert.equal(await usedDocument.text(), '');
      assert.equal(
        signed.headers
          .getSetCookie()
          .some((item) => item.startsWith('hash-talk-session=')),
        false,
      );
      const input = { ecosystem: 'evm', address: signer.address.toLowerCase() };
      const denied = await post('handoff-confirm', input, walletCookie);
      assert.equal(denied.status, 401);
      await denied.text();
      const accepted = await post('handoff-confirm', input, originalCookie);
      assert.equal(accepted.status, 200);
      const session = (await accepted.json()) as { historyAuthorized: boolean };
      assert.equal(session.historyAuthorized, false);
      assert.ok(
        accepted.headers
          .getSetCookie()
          .some((item) => item.startsWith('hash-talk-session=')),
      );
    },
  );

  await t.test(
    'HTTP exige origem e CSRF, usa cookies HttpOnly, rejeita campos secretos e encerra sessão',
    async () => {
      // This independent HTTP scenario gets its own unchanged rate limit.
      httpAccount.close();
      httpAccount = freshHttpAccount();
      const signer = wallet();
      const headers = { Origin: origin, 'Content-Type': 'application/json' };
      const input = {
        address: signer.address,
        chainId: 1,
        deviceId: randomUUID(),
      };
      const blocked = await fetch(`${origin}/api/account/challenge`, {
        method: 'POST',
        headers: { ...headers, Origin: 'https://wrong.example' },
        body: JSON.stringify(input),
      });
      assert.equal(blocked.status, 403);
      await blocked.text();
      const secret = await fetch(`${origin}/api/account/challenge`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...input,
          recoverySecret: 'must-never-be-accepted',
        }),
      });
      assert.equal(secret.status, 400);
      await secret.text();
      const challengeResponse = await fetch(`${origin}/api/account/challenge`, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });
      assert.equal(challengeResponse.status, 200);
      const challenge = (await challengeResponse.json()) as {
        id: string;
        message: string;
      };
      const challengeCookie = challengeResponse.headers.get('set-cookie');
      assert.ok(challengeCookie);
      assert.match(challengeCookie, /HttpOnly; SameSite=Strict/);
      const loginResponse = await fetch(`${origin}/api/account/login`, {
        method: 'POST',
        headers: { ...headers, Cookie: challengeCookie.split(';')[0] ?? '' },
        body: JSON.stringify({
          id: challenge.id,
          signature: await signer.signMessage(challenge.message),
        }),
      });
      assert.equal(loginResponse.status, 200);
      const login = (await loginResponse.json()) as {
        csrf: string;
        historyAuthorized: boolean;
      };
      assert.equal(login.historyAuthorized, false);
      const sessionCookie = loginResponse.headers
        .getSetCookie()
        .find((item) => item.startsWith('hash-talk-session='));
      assert.ok(sessionCookie);
      const authenticatedHeaders = {
        ...headers,
        Cookie: sessionCookie.split(';')[0] ?? '',
      };
      const denied = await fetch(`${origin}/api/account/name`, {
        method: 'POST',
        headers: authenticatedHeaders,
        body: JSON.stringify({ name: 'Não pode' }),
      });
      assert.equal(denied.status, 403);
      await denied.text();
      const saved = await fetch(`${origin}/api/account/name`, {
        method: 'POST',
        headers: { ...authenticatedHeaders, 'X-Hash-Talk-CSRF': login.csrf },
        body: JSON.stringify({ name: 'Nome HTTP' }),
      });
      assert.equal(saved.status, 200);
      await saved.text();
      const logout = await fetch(`${origin}/api/account/logout`, {
        method: 'POST',
        headers: { ...authenticatedHeaders, 'X-Hash-Talk-CSRF': login.csrf },
        body: '{}',
      });
      assert.equal(logout.status, 200);
      await logout.text();
      const ended = await fetch(`${origin}/api/account/session`, {
        headers: authenticatedHeaders,
      });
      assert.equal(ended.status, 401);
      await ended.text();
    },
  );
});
