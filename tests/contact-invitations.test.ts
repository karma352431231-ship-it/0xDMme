import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrivateContactInvitations } from '../src/client/contacts/invitations.ts';
import { readInvitation } from '../src/shared/contacts/index.ts';
import { digest } from '../src/shared/devices/index.ts';
import { deferred } from './fixtures/deferred.ts';

function fixture() {
  const hashes: string[] = [],
    revoked: string[] = [];
  const state = { owner: crypto.randomUUID() as string | null };
  const invitations = new PrivateContactInvitations({
    owner: () => state.owner,
    origin: 'https://0xdmme.app',
    issue: (hash) => {
      hashes.push(hash);
      return Promise.resolve(Date.now() + 86400000);
    },
    revoke: (hash) => {
      revoked.push(hash);
      return Promise.resolve();
    },
  });
  return { invitations, state, hashes, revoked };
}
await test('a contact invitation is created only on demand and the server receives only its hash', async () => {
  const f = fixture();
  assert.equal(f.invitations.link, null);
  assert.deepEqual(f.hashes, []);
  await f.invitations.create();
  const first = readInvitation(f.invitations.link!, 'https://0xdmme.app');
  assert.equal(f.hashes[0], await digest(first.token));
  assert.notEqual(f.hashes[0], first.token);
  await f.invitations.create();
  const second = readInvitation(f.invitations.link!, 'https://0xdmme.app');
  assert.notEqual(first.token, second.token);
  assert.deepEqual(
    f.revoked,
    [],
    'Creating another link cannot revoke the first',
  );
});
await test('an invitation expires in the UI after 24 hours and is not restored by clearing the screen', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const f = fixture();
  await f.invitations.create();
  t.mock.timers.tick(86400000);
  assert.equal(f.invitations.link, null);
  f.invitations.clear();
  assert.equal(f.invitations.link, null);
});
await test('revocation targets only the currently displayed invitation', async () => {
  const f = fixture();
  await f.invitations.create();
  await f.invitations.create();
  await f.invitations.revoke();
  assert.deepEqual(f.revoked, [f.hashes[1]]);
  assert.equal(f.invitations.link, null);
});
await test('session replacement during issuance cannot disclose the old account invitation', async () => {
  let owner = crypto.randomUUID();
  let requests = 0;
  const issued = deferred<number>();
  const invitations = new PrivateContactInvitations({
    owner: () => owner,
    origin: 'https://0xdmme.app',
    issue: () => {
      requests++;
      return issued.promise;
    },
    revoke: () => Promise.resolve(),
  });
  const creating = invitations.create();
  owner = crypto.randomUUID();
  invitations.clear();
  issued.resolve(Date.now() + 86400000);
  await assert.rejects(creating, /Session changed/u);
  assert.equal(
    requests,
    0,
    'Stale work cannot issue an invitation for the replacement account',
  );
  assert.equal(invitations.link, null);
});
