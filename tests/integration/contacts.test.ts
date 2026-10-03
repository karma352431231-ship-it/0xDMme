import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Wallet } from 'ethers';
import { Database, walletHash } from '../../src/server/database/index.ts';
import {
  AccountService,
  createAccountHandler,
} from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { ContactService } from '../../src/server/contacts/index.ts';
import { createWebServer } from '../../src/server/web-host/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  createIdentity,
  createRecovery,
  newSecret,
} from '../../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../../src/client/device-operations/index.ts';
import { contactBody, contactLimits } from '../../src/shared/contacts/index.ts';
import { digest, eventHash, sign } from '../../src/shared/devices/index.ts';
import { object } from '../../src/shared/account/index.ts';
await test('contatos persistentes: descoberta, consentimento, bloqueio, limites e HTTP', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const database = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  await database.migrate();
  await inspector.connect();
  const origin = 'http://127.0.0.1:45118',
    account = new AccountService({ store: database.authentication, origin }),
    devices = new DeviceService(database.devices),
    contacts = new ContactService(database.contacts, database.devices);
  const host = createWebServer({
    origin,
    database,
    assets: new Map(),
    objects: { healthy: () => Promise.resolve(true) },
    account: createAccountHandler({
      origin,
      service: account,
      devices,
      contacts,
    }),
  });
  await new Promise<void>((resolve) =>
    host.server.listen(45118, '127.0.0.1', resolve),
  );
  const ids: string[] = [];
  t.after(async () => {
    await host.close();
    await inspector.query('BEGIN');
    await inspector.query(
      'DELETE FROM hash_talk.contact_relations WHERE lo=ANY($1::uuid[]) OR hi=ANY($1::uuid[])',
      [ids],
    );
    for (const table of [
      'contact_blocks',
      'contact_controls',
      'device_events',
      'device_directories',
      'login_sessions',
      'login_devices',
    ])
      await inspector.query(
        `DELETE FROM hash_talk.${table} WHERE account_id=ANY($1::uuid[])`,
        [ids],
      );
    await inspector.query(
      'DELETE FROM hash_talk.accounts WHERE id=ANY($1::uuid[])',
      [ids],
    );
    await inspector.query('COMMIT');
    await inspector.end();
    await database.close();
  });
  async function create(authorized = true, wallet = Wallet.createRandom()) {
    const challenge = await account.challenge({
      ecosystem: 'evm',
      address: wallet.address,
      chainId: 1,
      deviceId: crypto.randomUUID(),
    });
    const login = await account.login(
      {
        id: challenge.id,
        signature: await wallet.signMessage(challenge.message),
      },
      challenge.browserToken,
    );
    ids.push(login.session.accountId);
    const identity = await createIdentity(
        login.session.deviceId,
        'Teste sintético',
      ),
      recovery = await createRecovery(login.session.accountId, newSecret());
    const event = await prepareEvent({
      accountId: login.session.accountId,
      previous: null,
      kind: 'initialize',
      signer: 'recovery',
      signing: recovery.signing,
      root: recovery.root,
      identities: [identity.public],
      ring: freshKeyring(login.session.accountId),
      profile: null,
    });
    if (authorized)
      await devices.commit(login.session, { event, profile: null });
    return {
      ...login,
      identity,
      event,
      wallet: {
        ecosystem: 'evm' as const,
        address: wallet.address.toLowerCase(),
      },
    };
  }
  type User = Awaited<ReturnType<typeof create>>;
  async function proof(
    user: User,
    operation: string,
    payload: Record<string, unknown>,
  ) {
    const p = { directory: await eventHash(user.event), payload };
    return {
      ...p,
      signature: await sign(
        user.identity.signing,
        contactBody(
          user.session.accountId,
          user.session.deviceId,
          operation,
          p,
        ),
      ),
    };
  }
  async function op(
    user: User,
    operation: string,
    payload: Record<string, unknown> = {},
  ) {
    return contacts.operate(
      operation,
      user.session,
      await proof(user, operation, payload),
    );
  }
  async function rev(user: User) {
    return Number(object(await op(user, 'state'))['revision']);
  }
  async function configure(
    user: User,
    mode = 'wallet',
    inviteHash: string | null = null,
  ) {
    return op(user, 'configure', {
      revision: await rev(user),
      mode,
      inviteHash,
    });
  }
  async function request(a: User, b: User, invite: string | null = null) {
    return op(a, 'request', {
      revision: await rev(a),
      target: b.session.accountId,
      invite,
    });
  }
  async function respond(a: User, b: User, accept: boolean) {
    return op(a, 'respond', {
      revision: await rev(a),
      target: b.session.accountId,
      accept,
    });
  }
  async function blocked(a: User, b: User, blocked: boolean) {
    return op(a, 'block', {
      revision: await rev(a),
      wallet: b.wallet,
      blocked,
    });
  }
  async function allowed(a: User, b: User) {
    return database.contacts.approved(
      { session: a.session, directory: await eventHash(a.event) },
      b.session.accountId,
    );
  }
  const a = await create(),
    b = await create(),
    c = await create(),
    pending = await create(false);
  await t.test(
    'modo conservador oculta cadastro; apenas aparelhos autorizados consultam; ecossistema/endereço são exatos',
    async () => {
      assert.equal(await op(a, 'discover', b.wallet), null);
      await assert.rejects(op(pending, 'state'));
      await configure(b);
      const configuredRevision = await rev(b);
      await configure(b);
      assert.equal(await rev(b), configuredRevision);
      assert.equal(
        object(await op(a, 'discover', b.wallet))['accountId'],
        b.session.accountId,
      );
      assert.equal(
        await op(a, 'discover', {
          ecosystem: 'evm',
          address: '0x' + 'f'.repeat(40),
        }),
        null,
      );
      await assert.rejects(
        op(a, 'discover', { ...b.wallet, address: b.wallet.address + 'f' }),
      );
      assert.equal(await allowed(a, b), false);
    },
  );
  await t.test(
    'convite revogável só permite solicitar e não revela foto; somente destinatário aceita; cruzamento não aprova',
    async () => {
      const token = 'a'.repeat(64);
      await configure(b, 'invite', await digest(token));
      assert.equal(await op(a, 'discover', b.wallet), null);
      assert.equal(
        object(await op(a, 'invite', { owner: b.session.accountId, token }))[
          'accountId'
        ],
        b.session.accountId,
      );
      await assert.rejects(request(a, b));
      await request(a, b, token);
      assert.equal(await allowed(a, b), false);
      await assert.rejects(respond(a, b, true));
      await assert.rejects(respond(c, a, true));
      await configure(a);
      await assert.rejects(request(b, a));
      assert.equal(await allowed(a, b), false);
      await respond(b, a, true);
      assert.equal(await allowed(a, b), true);
      assert.equal(await allowed(b, a), true);
      const list = object(
        await op(b, 'list', { kind: 'approved', after: null }),
      );
      assert.equal((list['items'] as unknown[]).length, 1);
      assert.equal(JSON.stringify(list).includes('photo'), false);
      await configure(b, 'invite', null);
      assert.equal(
        await op(c, 'invite', { owner: b.session.accountId, token }),
        null,
      );
      await assert.rejects(request(c, b, token));
      assert.equal(await allowed(a, b), true);
    },
  );
  await t.test(
    'bloqueio vale no servidor, cancela aprovação bilateral e não é revertido por estado antigo/desbloqueio',
    async () => {
      const stale = await rev(b);
      await blocked(b, a, true);
      assert.equal(await allowed(a, b), false);
      assert.equal(await allowed(b, a), false);
      assert.equal(await op(a, 'discover', b.wallet), null);
      await assert.rejects(
        op(a, 'directory', { target: b.session.accountId, after: 0 }),
      );
      await assert.rejects(
        op(b, 'configure', {
          revision: stale,
          mode: 'wallet',
          inviteHash: null,
        }),
      );
      await blocked(b, a, false);
      assert.equal(await allowed(a, b), false);
      await configure(b);
      await request(a, b);
      await respond(b, a, true);
      const reopened = new Database(config.databaseUrl);
      try {
        assert.equal(
          await reopened.contacts.approved(
            { session: a.session, directory: await eventHash(a.event) },
            b.session.accountId,
          ),
          true,
        );
      } finally {
        await reopened.close();
      }
    },
  );
  await t.test(
    'rejeitar impede repetição; destinatário pode iniciar pedido inverso; bloqueio remove pedidos dos dois lados',
    async () => {
      await configure(c);
      await request(a, c);
      await respond(c, a, false);
      await assert.rejects(request(a, c));
      await request(c, a);
      assert.equal(await allowed(a, c), false);
      await blocked(a, c, true);
      assert.equal(
        (
          object(await op(c, 'list', { kind: 'outgoing', after: null }))[
            'items'
          ] as unknown[]
        ).length,
        0,
      );
    },
  );
  await t.test(
    'block wallet antes do cadastro, limite diário durável e metadados sem apelido',
    async () => {
      const unknown = { ecosystem: 'evm', address: '0x' + 'e'.repeat(40) };
      await op(a, 'block', {
        revision: await rev(a),
        wallet: unknown,
        blocked: true,
      });
      const hash = await walletHash({
        ecosystem: 'evm',
        address: unknown.address,
      });
      const list = object(
        await op(a, 'list', { kind: 'blocked', after: null }),
      );
      assert.ok(JSON.stringify(list).includes(hash));
      assert.equal(JSON.stringify(list).includes(unknown.address), false);
      await op(a, 'unblock', { revision: await rev(a), walletHash: hash });
      await inspector.query(
        `UPDATE hash_talk.contact_controls SET requests_today=$2,request_day=(now() AT TIME ZONE 'UTC')::date WHERE account_id=$1`,
        [c.session.accountId, contactLimits.requestsPerDay],
      );
      await blocked(a, c, false);
      await configure(b);
      await assert.rejects(request(c, b));
      const rows = await inspector.query(
        'SELECT * FROM hash_talk.contact_relations WHERE lo=$1 OR hi=$1',
        [a.session.accountId],
      );
      assert.equal(JSON.stringify(rows.rows).includes('alias'), false);
    },
  );
  await t.test(
    'pedidos concorrentes não ultrapassam caixa; idempotência preserva um único registro; paginação limita resposta',
    async () => {
      const target = await create();
      await configure(target);
      const x = await create(),
        y = await create();
      const synthetic: string[] = [];
      for (let n = 0; n < contactLimits.incoming - 1; n++) {
        const row = await inspector.query<{ id: string }>(
          'INSERT INTO hash_talk.accounts(address) VALUES($1) RETURNING id',
          ['0x' + crypto.randomUUID().replaceAll('-', '').padEnd(40, '0')],
        );
        const id = row.rows[0]!.id;
        ids.push(id);
        synthetic.push(id);
        await inspector.query(
          "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'pending')",
          [id, target.session.accountId],
        );
      }
      const results = await Promise.allSettled([
        request(x, target),
        request(y, target),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      const winner = results[0]?.status === 'fulfilled' ? x : y;
      await request(winner, target);
      const counts = await inspector.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM hash_talk.contact_relations WHERE (lo=$1 OR hi=$1) AND state='pending'",
        [target.session.accountId],
      );
      assert.equal(counts.rows[0]?.count, contactLimits.incoming);
      const first = object(
        await op(target, 'list', { kind: 'incoming', after: null }),
      );
      assert.equal((first['items'] as unknown[]).length, 16);
      assert.equal(typeof first['next'], 'string');
      const second = object(
        await op(target, 'list', { kind: 'incoming', after: first['next'] }),
      );
      assert.equal((second['items'] as unknown[]).length, 16);
      assert.notDeepEqual(first['items'], second['items']);
    },
  );
  await t.test(
    'tetos globais recusam novas entradas sem apagar consentimento; controles existentes e remoção de bloqueio continuam disponíveis',
    async () => {
      const fresh = await create();
      // Populate only synthetic boundary state, with one relation/block per
      // owner. No wallet signatures, network traffic or user rows are invented.
      const seeded = Array.from({ length: contactLimits.globalControls }, () =>
        crypto.randomUUID(),
      );
      ids.push(...seeded);
      await inspector.query(
        "INSERT INTO hash_talk.accounts(id,address) SELECT id,'0x'||replace(id::text,'-','')||'00000000' FROM unnest($1::uuid[]) AS seed(id)",
        [seeded],
      );
      const controls = await inspector.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM hash_talk.contact_controls',
      );
      await inspector.query(
        'INSERT INTO hash_talk.contact_controls(account_id) SELECT unnest($1::uuid[])',
        [
          seeded.slice(
            0,
            contactLimits.globalControls - controls.rows[0]!.count,
          ),
        ],
      );
      await assert.rejects(configure(fresh), { status: 503 });
      await configure(a, 'invite');
      const saved = { ecosystem: 'evm', address: '0x' + 'd'.repeat(40) };
      await op(a, 'block', {
        revision: await rev(a),
        wallet: saved,
        blocked: true,
      });
      const blocks = await inspector.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM hash_talk.contact_blocks',
      );
      await inspector.query(
        'INSERT INTO hash_talk.contact_blocks(account_id,wallet_hash) SELECT unnest($1::uuid[]),$2',
        [
          seeded.slice(0, contactLimits.globalBlocks - blocks.rows[0]!.count),
          'a'.repeat(64),
        ],
      );
      const another = { ecosystem: 'evm', address: '0x' + 'f'.repeat(40) };
      await assert.rejects(
        op(a, 'block', {
          revision: await rev(a),
          wallet: another,
          blocked: true,
        }),
        { status: 503 },
      );
      await op(a, 'unblock', {
        revision: await rev(a),
        walletHash: await walletHash({
          ecosystem: 'evm',
          address: saved.address,
        }),
      });
      await op(a, 'block', {
        revision: await rev(a),
        wallet: another,
        blocked: true,
      });
      const relations = await inspector.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM hash_talk.contact_relations',
      );
      const remaining = contactLimits.global - relations.rows[0]!.count;
      await inspector.query(
        "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) SELECT least(a,b),greatest(a,b),a,'rejected' FROM unnest($1::uuid[],$2::uuid[]) AS pair(a,b)",
        [
          Array.from({ length: remaining }, (_, i) => seeded[2 * i]),
          Array.from({ length: remaining }, (_, i) => seeded[2 * i + 1]),
        ],
      );
      await assert.rejects(request(a, c), { status: 429 });
      assert.equal(await allowed(a, b), true);
      const final = await inspector.query<{
        controls: number;
        blocks: number;
        relations: number;
      }>(
        'SELECT (SELECT count(*)::int FROM hash_talk.contact_controls) AS controls,(SELECT count(*)::int FROM hash_talk.contact_blocks) AS blocks,(SELECT count(*)::int FROM hash_talk.contact_relations) AS relations',
      );
      assert.deepEqual(final.rows[0], {
        controls: contactLimits.globalControls,
        blocks: contactLimits.globalBlocks,
        relations: contactLimits.global,
      });
    },
  );
  await t.test(
    'HTTP exige origem, CSRF, sessão e assinatura; sessão encerrada invalida autorização antiga',
    async () => {
      const p = await proof(a, 'state', {});
      async function http(headers: Record<string, string>, input: unknown = p) {
        return fetch(origin + '/api/account/contacts/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(input),
        });
      }
      const headers = {
        Origin: origin,
        Cookie: 'hash-talk-session=' + a.sessionToken,
        'X-Hash-Talk-CSRF': a.session.csrf,
      };
      let r = await http(headers);
      assert.equal(r.status, 200);
      await r.text();
      r = await http({ ...headers, Origin: 'https://wrong.example' });
      assert.equal(r.status, 403);
      await r.text();
      r = await http({ ...headers, 'X-Hash-Talk-CSRF': 'x' });
      assert.equal(r.status, 403);
      await r.text();
      r = await http(headers, { ...p, payload: { extra: 1 } });
      assert.equal(r.status, 409);
      await r.text();
      await inspector.query(
        'DELETE FROM hash_talk.login_sessions WHERE account_id=$1',
        [a.session.accountId],
      );
      await assert.rejects(op(a, 'state'));
      r = await http(headers);
      assert.equal(r.status, 401);
      await r.text();
    },
  );
});
