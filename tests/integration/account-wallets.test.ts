import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { base58 } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519';
import pg from 'pg';
import { Wallet } from 'ethers';
import { Database } from '../../src/server/database/index.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { AccountWalletService } from '../../src/server/account-wallets/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { AccountError } from '../../src/shared/account/index.ts';
import type { AccountSession } from '../../src/shared/account/index.ts';
import { walletAdditionStatement } from '../../src/shared/account-wallets/index.ts';
import type { WalletIdentity } from '../../src/shared/account-wallets/index.ts';

const config = readWebConfiguration(process.env);
if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
  throw new Error('A dedicated test database is required.');
const database = new Database(config.databaseUrl);
const inspector = new pg.Client({ connectionString: config.databaseUrl });
const origin = 'http://127.0.0.1:45111';
const service = new AccountService({ store: database.authentication, origin });
const wallets = new AccountWalletService({
  store: database.accountWallets,
  origin,
});
const ownAddresses: string[] = [];

interface Signer {
  identity: WalletIdentity;
  chainId: number | string;
  sign: (message: string) => Promise<string>;
}
function evm(): Signer {
  const wallet = Wallet.createRandom();
  const address = wallet.address.toLowerCase();
  ownAddresses.push(address);
  return {
    identity: { ecosystem: 'evm', address },
    chainId: 1,
    sign: (message) => wallet.signMessage(message),
  };
}
function solana(): Signer {
  const secret = ed25519.utils.randomSecretKey();
  const address = base58.encode(ed25519.getPublicKey(secret));
  ownAddresses.push(address);
  return {
    identity: { ecosystem: 'solana', address },
    chainId: 'solana:mainnet',
    sign: (message) =>
      Promise.resolve(
        base58.encode(ed25519.sign(new TextEncoder().encode(message), secret)),
      ),
  };
}
async function signIn(signer: Signer): Promise<{
  sessionToken: string;
  session: AccountSession;
}> {
  const challenge = await service.challenge({
    ...signer.identity,
    chainId: signer.chainId,
    deviceId: randomUUID(),
  });
  return service.login(
    { id: challenge.id, signature: await signer.sign(challenge.message) },
    challenge.browserToken,
  );
}
/** The whole user action: ask for the statement, sign it with the new wallet. */
async function addWallet(session: AccountSession, signer: Signer) {
  const request = wallets.request(session, signer.identity);
  return wallets.add(session, {
    id: request.id,
    signature: await signer.sign(request.message),
  });
}
function refused(status: number, text: RegExp) {
  return (error: unknown) =>
    error instanceof AccountError &&
    error.status === status &&
    text.test(error.message);
}

await test('extra sign-in wallets', async (t) => {
  await database.migrate();
  await inspector.connect();
  t.after(async () => {
    // Only identities created by this run; extra wallets cascade with accounts.
    await inspector.query('BEGIN');
    try {
      const accounts = await inspector.query<{ id: string }>(
        `SELECT id FROM hash_talk.accounts WHERE address = ANY($1::text[])
        UNION SELECT account_id FROM hash_talk.account_wallets WHERE address = ANY($1::text[])`,
        [ownAddresses],
      );
      const ids = accounts.rows.map((row) => row.id);
      for (const table of ['login_sessions', 'login_devices'])
        await inspector.query(
          `DELETE FROM hash_talk.${table} WHERE account_id = ANY($1::uuid[])`,
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
    'a backup wallet that signed the statement signs in to the same account, across ecosystems',
    async () => {
      const primary = evm();
      const backup = solana();
      const owner = await signIn(primary);
      const request = wallets.request(owner.session, backup.identity);
      assert.equal(
        request.message,
        walletAdditionStatement({
          origin,
          account: primary.identity,
          wallet: backup.identity,
          id: request.id,
          expiresAt: request.expiresAt,
        }),
      );
      const listed = await wallets.add(owner.session, {
        id: request.id,
        signature: await backup.sign(request.message),
      });
      assert.deepEqual(listed, [
        { ...primary.identity, primary: true },
        { ...backup.identity, primary: false },
      ]);

      const entered = await signIn(backup);
      assert.equal(entered.session.accountId, owner.session.accountId);
      // The account keeps presenting its primary wallet.
      assert.equal(entered.session.address, primary.identity.address);
      assert.equal(entered.session.ecosystem, 'evm');
      assert.equal(entered.session.walletConfirmed, true);
      assert.equal(
        await database.authentication.previewAccountId(backup.identity),
        owner.session.accountId,
      );
      assert.deepEqual(await wallets.list(entered.session), listed);
    },
  );

  await t.test(
    'a wallet with its own account, a repeated wallet and a third wallet are refused',
    async () => {
      const owner = await signIn(evm());
      const independent = evm();
      await signIn(independent);
      await assert.rejects(
        addWallet(owner.session, independent),
        refused(409, /already has its own account/u),
      );

      const backup = evm();
      await addWallet(owner.session, backup);
      await assert.rejects(
        addWallet(owner.session, backup),
        refused(409, /already on this account/u),
      );
      await assert.rejects(
        addWallet(owner.session, evm()),
        refused(409, /maximum number of wallets/u),
      );

      // A backup of one account cannot be added to another.
      const other = await signIn(evm());
      await assert.rejects(
        addWallet(other.session, backup),
        refused(409, /already has its own account/u),
      );
      assert.equal((await wallets.list(other.session)).length, 1);
    },
  );

  await t.test(
    'only the named wallet, in the requesting wallet-confirmed session and once, can complete a request',
    async () => {
      const primary = evm();
      const owner = await signIn(primary);
      const backup = evm();

      const impostor = wallets.request(owner.session, backup.identity);
      await assert.rejects(
        wallets.add(owner.session, {
          id: impostor.id,
          signature: await evm().sign(impostor.message),
        }),
        refused(403, /Invalid authorization signature/u),
      );
      // The failed attempt consumed the request.
      await assert.rejects(
        wallets.add(owner.session, {
          id: impostor.id,
          signature: await backup.sign(impostor.message),
        }),
        refused(401, /invalid or expired/u),
      );

      const second = await signIn(primary);
      const foreign = wallets.request(owner.session, backup.identity);
      await assert.rejects(
        wallets.add(second.session, {
          id: foreign.id,
          signature: await backup.sign(foreign.message),
        }),
        refused(401, /invalid or expired/u),
      );

      // A session linked by code has not confirmed the wallet.
      await inspector.query(
        'UPDATE hash_talk.login_sessions SET wallet_confirmed = false WHERE csrf = $1',
        [second.session.csrf],
      );
      const linked = await service.session(second.sessionToken);
      assert.throws(
        () => wallets.request(linked, backup.identity),
        refused(403, /Confirm your wallet/u),
      );
      // Even a request issued before the session lost confirmation is refused.
      const stale = wallets.request(second.session, backup.identity);
      await assert.rejects(
        wallets.add(second.session, {
          id: stale.id,
          signature: await backup.sign(stale.message),
        }),
        refused(403, /Confirm your wallet/u),
      );
      assert.throws(
        () => wallets.request(owner.session, primary.identity),
        refused(409, /already on this account/u),
      );
      assert.equal((await wallets.list(owner.session)).length, 1);
    },
  );

  await t.test(
    'a removed wallet stops entering the account and may open a separate one; the primary cannot be removed',
    async () => {
      const primary = evm();
      const backup = evm();
      const owner = await signIn(primary);
      await addWallet(owner.session, backup);
      const viaBackup = await signIn(backup);

      await assert.rejects(
        wallets.remove(owner.session, primary.identity),
        refused(404, /not an extra wallet/u),
      );
      assert.deepEqual(await wallets.remove(owner.session, backup.identity), [
        { ...primary.identity, primary: true },
      ]);
      await assert.rejects(
        wallets.remove(owner.session, backup.identity),
        refused(404, /not an extra wallet/u),
      );

      const separate = await signIn(backup);
      assert.notEqual(separate.session.accountId, owner.session.accountId);
      assert.equal(separate.session.address, backup.identity.address);
      // Removal does not end sessions the wallet had already opened.
      assert.equal(
        (await service.session(viaBackup.sessionToken)).accountId,
        owner.session.accountId,
      );
      // The freed slot accepts another wallet.
      assert.equal((await addWallet(owner.session, evm())).length, 2);
    },
  );

  await t.test(
    'two accounts racing for the same wallet end with exactly one owner',
    async () => {
      const first = await signIn(evm());
      const second = await signIn(evm());
      const contested = evm();
      const results = await Promise.allSettled([
        addWallet(first.session, contested),
        addWallet(second.session, contested),
        signIn(contested),
      ]);
      const owners = await inspector.query<{ id: string }>(
        `SELECT id FROM hash_talk.accounts WHERE address = $1
        UNION ALL SELECT account_id FROM hash_talk.account_wallets WHERE address = $1`,
        [contested.identity.address],
      );
      assert.equal(owners.rows.length, 1);
      assert.ok(results.some((result) => result.status === 'rejected'));
    },
  );
});
