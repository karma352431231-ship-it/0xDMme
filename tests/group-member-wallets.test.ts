import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GroupMemberWallets,
  memberWalletPage,
} from '../src/client/groups/member-wallets.ts';
import type { MemberWallet } from '../src/client/groups/member-wallets.ts';

const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const wallet = (n: number): MemberWallet => ({
  accountId: id(n),
  ecosystem: 'evm',
  address: `0x${n.toString(16).padStart(40, '0')}`,
});

await test('member wallets: 16 per read, invitation-only stays null, failures retry only on tap', async () => {
  const reads: string[][] = [];
  let fail = false;
  const wallets = new GroupMemberWallets((_group, accounts) => {
    reads.push(accounts);
    if (fail) return Promise.reject(new Error('offline'));
    // Only even members accept requests by wallet.
    return Promise.resolve(
      accounts
        .map((account) => Number(account.slice(-12)))
        .filter((n) => n % 2 === 0)
        .map(wallet),
    );
  });
  const members = Array.from({ length: 20 }, (_, n) => id(n + 1));
  assert.equal(await wallets.load('g1', members), true);
  assert.deepEqual(
    reads.map((batch) => batch.length),
    [16, 4],
  );
  assert.deepEqual(wallets.get(id(2)), wallet(2));
  assert.equal(wallets.get(id(3)), null);
  assert.equal(await wallets.load('g1', members), false, 'no second read');
  assert.equal(reads.length, 2);

  fail = true;
  assert.equal(await wallets.load('g2', [id(4)]), false);
  assert.equal(wallets.get(id(4)), undefined, 'a group switch resets');
  assert.equal(await wallets.load('g2', [id(4)]), false);
  assert.equal(reads.length, 3, 'a failed member is not re-read on redraw');
  fail = false;
  assert.deepEqual(await wallets.contact('g2', id(4)), wallet(4));
});

await test('member wallet pages reject extra fields and oversized batches', () => {
  assert.deepEqual(memberWalletPage({ items: [wallet(2)] }), [wallet(2)]);
  assert.throws(() =>
    memberWalletPage({ items: [{ ...wallet(2), name: 'private' }] }),
  );
  assert.throws(() =>
    memberWalletPage({
      items: Array.from({ length: 17 }, (_, n) => wallet(n)),
    }),
  );
});
