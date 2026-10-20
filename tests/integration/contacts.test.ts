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
import {
  contactBody,
  contactPageSize,
} from '../../src/shared/contacts/index.ts';
import type { ContactList } from '../../src/shared/contacts/index.ts';
import { digest, eventHash, sign } from '../../src/shared/devices/index.ts';
import { AccountError, object } from '../../src/shared/account/index.ts';
import { verifyContactConcurrency } from './contact-concurrency-fixture.ts';
import { verifyContactPairConcurrency } from './contact-pair-concurrency-fixture.ts';
await test('persistent contacts: discovery, consent, blocking, no caps and HTTP', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const database = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  // The port is chosen by the OS, so parallel jobs cannot collide on it.
  let origin = 'http://127.0.0.1';
  let handler: ReturnType<typeof createAccountHandler> | null = null;
  const devices = new DeviceService(database.devices),
    contacts = new ContactService(database.contacts, database.devices);
  const host = createWebServer({
    get origin() {
      return origin;
    },
    database,
    assets: new Map(),
    objects: { healthy: () => Promise.resolve(true) },
    account: {
      handle: async (request, response) => {
        assert.ok(handler);
        await handler.handle(request, response);
      },
      close: () => handler?.close(),
    },
  });
  const ids: string[] = [];
  t.after(async () => {
    try {
      if (host.server.listening) await host.close();
      else handler?.close();
      if (ids.length === 0) return;
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
    } finally {
      await Promise.all([inspector.end(), database.close()]);
    }
  });
  // Register teardown before setup so its failures cannot keep the runner open.
  await database.migrate();
  await inspector.connect();
  await new Promise<void>((resolve, reject) => {
    host.server.once('error', reject);
    host.server.listen(0, '127.0.0.1', () => {
      host.server.off('error', reject);
      resolve();
    });
  });
  const address = host.server.address();
  assert.ok(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
  const account = new AccountService({
    store: database.authentication,
    origin,
  });
  handler = createAccountHandler({
    origin,
    service: account,
    devices,
    contacts,
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
  async function configure(user: User, mode = 'wallet') {
    return op(user, 'configure', {
      revision: await rev(user),
      mode,
      inviteHash: null,
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
  // Historical thresholds are regression fixtures, not product policies.
  const formerBudgets = {
    incoming: 64,
    outgoing: 32,
    relationships: 256,
    blocks: 256,
    global: 10000,
    globalBlocks: 10000,
    globalControls: 20000,
  };
  async function seedAccounts(count: number): Promise<string[]> {
    const seeded = Array.from({ length: count }, () => crypto.randomUUID());
    ids.push(...seeded);
    await inspector.query(
      "INSERT INTO hash_talk.accounts(id,address) SELECT id,'0x'||replace(id::text,'-','')||'00000000' FROM unnest($1::uuid[]) AS seed(id)",
      [seeded],
    );
    return seeded;
  }
  async function listed(user: User, kind: ContactList, expected: number) {
    const seen = new Set<string>();
    let after: string | null = null;
    // Bound the test itself while checking that every stored item is accessible.
    for (let n = 0; n <= Math.ceil(expected / contactPageSize); n++) {
      const page = object(await op(user, 'list', { kind, after }));
      const items = page['items'];
      assert.ok(Array.isArray(items));
      assert.ok(items.length <= contactPageSize);
      for (const item of items) {
        const id = String(
          object(item)[kind === 'blocked' ? 'walletHash' : 'accountId'],
        );
        assert.equal(seen.has(id), false);
        seen.add(id);
      }
      if (page['next'] === null) {
        assert.equal(seen.size, expected);
        return seen;
      }
      const next = page['next'];
      assert.ok(typeof next === 'string');
      after = next;
    }
    assert.fail('Paginação não chegou ao fim dos registros esperados.');
  }
  const a = await create(),
    b = await create(),
    c = await create(),
    pending = await create(false);
  await verifyContactConcurrency(t, {
    database,
    inspector,
    authority: { session: a.session, directory: await eventHash(a.event) },
    peer: { session: b.session, directory: await eventHash(b.event) },
  });
  await t.test(
    'conservative mode hides registration; only authorized devices query; ecosystem and address are exact',
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
    'revocable invitation only allows requesting and reveals no photo; only recipient accepts; crossing requests cannot approve',
    async () => {
      const token = 'a'.repeat(64);
      await configure(b, 'invite');
      await op(b, 'issue-invitation', { hash: await digest(token) });
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
      assert.equal(
        object(await op(a, 'peer', { target: b.session.accountId }))[
          'accountId'
        ],
        b.session.accountId,
      );
      await assert.rejects(op(c, 'peer', { target: b.session.accountId }), {
        status: 404,
      });
      const list = object(
        await op(b, 'list', { kind: 'approved', after: null }),
      );
      assert.equal((list['items'] as unknown[]).length, 1);
      assert.equal(JSON.stringify(list).includes('photo'), false);
      const fresh = 'b'.repeat(64);
      await op(b, 'issue-invitation', { hash: await digest(fresh) });
      await configure(b, 'wallet');
      assert.equal(
        object(await op(c, 'discover', b.wallet))['accountId'],
        b.session.accountId,
      );
      assert.equal(
        object(
          await op(c, 'invite', { owner: b.session.accountId, token: fresh }),
        )['accountId'],
        b.session.accountId,
      );
      await configure(b, 'contacts');
      assert.equal(await op(c, 'discover', b.wallet), null);
      assert.equal(
        await op(c, 'invite', { owner: b.session.accountId, token }),
        null,
      );
      assert.equal(
        object(await op(a, 'discover', b.wallet))['accountId'],
        b.session.accountId,
      );
      await configure(b, 'invite');
      await op(b, 'revoke-invitation', { hash: await digest(fresh) });
      assert.equal(
        await op(c, 'invite', { owner: b.session.accountId, token }),
        null,
      );
      await assert.rejects(request(c, b, token));
      assert.equal(await allowed(a, b), true);
    },
  );
  await t.test(
    'independent contact invitations expire after 24 hours and allow exactly one new request',
    async () => {
      const owner = await create(),
        first = await create(),
        second = await create();
      const one = 'c'.repeat(64),
        two = 'd'.repeat(64);
      const createdAt = Date.now();
      const issued = object(
        await op(owner, 'issue-invitation', { hash: await digest(one) }),
      );
      assert.ok(Number(issued['expiresAt']) >= createdAt + 86390000);
      assert.ok(Number(issued['expiresAt']) <= Date.now() + 86400000);
      assert.deepEqual(
        await op(owner, 'issue-invitation', { hash: await digest(one) }),
        issued,
        'An issuance retry must not renew the expiry',
      );
      await op(owner, 'issue-invitation', { hash: await digest(two) });
      assert.ok(
        await op(first, 'invite', {
          owner: owner.session.accountId,
          token: one,
        }),
      );
      assert.ok(
        await op(second, 'invite', {
          owner: owner.session.accountId,
          token: two,
        }),
      );
      await request(first, owner, one);
      const revisionAfter = await rev(first);
      await request(first, owner, one);
      assert.equal(
        await rev(first),
        revisionAfter,
        'The same pending request is idempotent',
      );
      await assert.rejects(request(second, owner, one), { status: 404 });
      assert.equal(
        await op(second, 'invite', {
          owner: owner.session.accountId,
          token: one,
        }),
        null,
      );
      await op(first, 'revoke-invitation', { hash: await digest(two) });
      assert.ok(
        await op(second, 'invite', {
          owner: owner.session.accountId,
          token: two,
        }),
        'A different account cannot revoke this link',
      );
      await request(second, owner, two);
      assert.equal(
        await allowed(first, owner),
        false,
        'A consumed invitation still requires the owner to accept',
      );
      await assert.rejects(
        op(owner, 'configure', {
          revision: await rev(owner),
          mode: 'invite',
          inviteHash: await digest(one),
        }),
        { status: 400 },
      );
      await assert.rejects(
        op(pending, 'issue-invitation', { hash: await digest(one) }),
      );
    },
  );
  await t.test(
    'concurrent recipients cannot spend the same invitation twice, and expired grants are reclaimed',
    async () => {
      const owner = await create(),
        first = await create(),
        second = await create();
      const shared = 'e'.repeat(64),
        expired = 'f'.repeat(64);
      await op(owner, 'issue-invitation', { hash: await digest(shared) });
      const results = await Promise.allSettled([
        request(first, owner, shared),
        request(second, owner, shared),
      ]);
      assert.equal(
        results.filter((result) => result.status === 'fulfilled').length,
        1,
      );
      const failure: unknown = results.find(
        (result) => result.status === 'rejected',
      )?.reason;
      assert.ok(failure instanceof AccountError);
      assert.equal(failure.status, 404);
      await inspector.query(
        'UPDATE hash_talk.contact_invitations SET used_by=NULL WHERE account_id=$1 AND token_hash=$2',
        [owner.session.accountId, await digest(shared)],
      );
      assert.equal(
        await op(first, 'invite', {
          owner: owner.session.accountId,
          token: shared,
        }),
        null,
        'An anonymized/deleted spender must not reopen a consumed grant',
      );
      await op(owner, 'issue-invitation', { hash: await digest(expired) });
      await inspector.query(
        "UPDATE hash_talk.contact_invitations SET expires_at=now()-interval '1 second' WHERE account_id=$1 AND token_hash=$2",
        [owner.session.accountId, await digest(expired)],
      );
      assert.equal(
        await op(first, 'invite', {
          owner: owner.session.accountId,
          token: expired,
        }),
        null,
      );
      await assert.rejects(request(first, owner, expired), { status: 404 });
      await database.contacts.expireInvitations();
      const remaining = await inspector.query(
        'SELECT token_hash FROM hash_talk.contact_invitations WHERE account_id=$1 ORDER BY token_hash',
        [owner.session.accountId],
      );
      assert.deepEqual(remaining.rows, [{ token_hash: await digest(shared) }]);
    },
  );
  const d = await create();
  const authority = async (user: User) => ({
    session: user.session,
    directory: await eventHash(user.event),
  });
  await verifyContactPairConcurrency(t, {
    database,
    inspector,
    pair: [await authority(a), await authority(b)],
    other: [await authority(c), await authority(d)],
  });
  await t.test(
    'server enforces blocking, cancels bilateral approval and rejects old-state or unblock restoration',
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
    "rejection prevents repetition; recipient may initiate the reverse request; blocking removes both sides' requests",
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
    'blocking before registration and metadata without aliases or daily counters',
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
      const obsolete = await inspector.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='hash_talk' AND table_name='contact_controls' AND column_name IN ('requests_today','request_day')",
      );
      assert.equal(obsolete.rowCount, 0);
      await blocked(a, c, false);
      const rows = await inspector.query(
        'SELECT * FROM hash_talk.contact_relations WHERE lo=$1 OR hi=$1',
        [a.session.accountId],
      );
      assert.equal(JSON.stringify(rows.rows).includes('alias'), false);
    },
  );
  await t.test(
    'received requests exceed the old cap, concurrent requests are idempotent and all pages remain accessible',
    async () => {
      const target = await create();
      await configure(target);
      const x = await create(),
        y = await create();
      const synthetic = await seedAccounts(formerBudgets.incoming);
      await inspector.query(
        "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) SELECT least(id,$2::uuid),greatest(id,$2::uuid),id,'pending' FROM unnest($1::uuid[]) AS seed(id)",
        [synthetic, target.session.accountId],
      );
      await Promise.all([request(x, target), request(y, target)]);
      await request(x, target);
      await request(y, target);
      const seen = await listed(target, 'incoming', formerBudgets.incoming + 2);
      assert.deepEqual(
        seen,
        new Set([...synthetic, x.session.accountId, y.session.accountId]),
      );
    },
  );
  await t.test(
    'relations and blocks exceed old account caps; more than 32 new requests in one day are accepted',
    async () => {
      const sender = await create();
      const recipients: User[] = [];
      for (let n = 0; n <= formerBudgets.outgoing; n++) {
        const recipient = await create();
        await configure(recipient);
        recipients.push(recipient);
      }
      const synthetic = await seedAccounts(formerBudgets.relationships);
      for (const owner of [sender, recipients[0]!])
        await inspector.query(
          "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) SELECT least(id,$2::uuid),greatest(id,$2::uuid),$2,'rejected' FROM unnest($1::uuid[]) AS seed(id)",
          [synthetic, owner.session.accountId],
        );
      for (const recipient of recipients) await request(sender, recipient);
      await request(sender, recipients[0]!);
      assert.deepEqual(
        await listed(sender, 'outgoing', recipients.length),
        new Set(recipients.map((r) => r.session.accountId)),
      );
      const counts = await inspector.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM hash_talk.contact_relations WHERE lo=$1 OR hi=$1',
        [sender.session.accountId],
      );
      assert.equal(
        counts.rows[0]?.count,
        formerBudgets.relationships + recipients.length,
      );
      const hashes = Array.from({ length: formerBudgets.blocks }, (_, n) =>
        n.toString(16).padStart(64, '0'),
      );
      await inspector.query(
        'INSERT INTO hash_talk.contact_blocks(account_id,wallet_hash) SELECT $1,unnest($2::text[])',
        [sender.session.accountId, hashes],
      );
      const unknown = {
        ecosystem: 'evm' as const,
        address: Wallet.createRandom().address.toLowerCase(),
      };
      const payload = {
        revision: await rev(sender),
        wallet: unknown,
        blocked: true,
      };
      await op(sender, 'block', payload);
      await op(sender, 'block', { ...payload, revision: await rev(sender) });
      assert.deepEqual(
        await listed(sender, 'blocked', formerBudgets.blocks + 1),
        new Set([...hashes, await walletHash(unknown)]),
      );
      assert.equal(await allowed(sender, recipients[0]!), false);
    },
  );
  await t.test(
    'controls, blocks and relations exceed old global caps without changing discovery or consent',
    async () => {
      const fresh = await create();
      // Synthetic persisted state crosses the former thresholds without
      // creating traffic, signatures or content on behalf of these identities.
      const seeded = await seedAccounts(formerBudgets.globalControls);
      await inspector.query(
        'INSERT INTO hash_talk.contact_controls(account_id) SELECT unnest($1::uuid[])',
        [seeded],
      );
      await configure(fresh);
      const saved = { ecosystem: 'evm', address: '0x' + 'd'.repeat(40) };
      await op(a, 'block', {
        revision: await rev(a),
        wallet: saved,
        blocked: true,
      });
      await inspector.query(
        'INSERT INTO hash_talk.contact_blocks(account_id,wallet_hash) SELECT unnest($1::uuid[]),$2',
        [seeded.slice(0, formerBudgets.globalBlocks), 'a'.repeat(64)],
      );
      const another = { ecosystem: 'evm', address: '0x' + 'f'.repeat(40) };
      await op(a, 'block', {
        revision: await rev(a),
        wallet: another,
        blocked: true,
      });
      await op(a, 'unblock', {
        revision: await rev(a),
        walletHash: await walletHash({
          ecosystem: 'evm',
          address: saved.address,
        }),
      });
      await inspector.query(
        "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) SELECT least(a,b),greatest(a,b),a,'rejected' FROM unnest($1::uuid[],$2::uuid[]) AS pair(a,b)",
        [
          Array.from({ length: formerBudgets.global }, (_, i) => seeded[2 * i]),
          Array.from(
            { length: formerBudgets.global },
            (_, i) => seeded[2 * i + 1],
          ),
        ],
      );
      await request(a, c);
      await request(a, c);
      assert.equal(await allowed(a, c), false);
      assert.equal(await allowed(a, b), true);
      assert.equal(object(await op(c, 'state'))['mode'], 'wallet');
      const final = await inspector.query<{
        controls: number;
        blocks: number;
        relations: number;
      }>(
        'SELECT (SELECT count(*)::int FROM hash_talk.contact_controls) AS controls,(SELECT count(*)::int FROM hash_talk.contact_blocks) AS blocks,(SELECT count(*)::int FROM hash_talk.contact_relations) AS relations',
      );
      const totals = final.rows[0]!;
      assert.ok(totals.controls > formerBudgets.globalControls);
      assert.ok(totals.blocks > formerBudgets.globalBlocks);
      assert.ok(totals.relations > formerBudgets.global);
    },
  );
  await t.test(
    'HTTP requires origin, CSRF, session and signature; ended session invalidates old authorization',
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
