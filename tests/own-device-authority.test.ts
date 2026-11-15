import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import {
  OwnDirectoryRequired,
  ownDirectoryRejected,
} from '../src/client/own-device-authority/index.ts';
import {
  sendPinnedBatch,
  PinnedSendBatch,
} from '../src/client/messages/send-batch.ts';
import { GroupSendPreparation } from '../src/client/groups/send-preparation.ts';
import { GroupGovernance } from '../src/client/groups/governance.ts';
import { PeerIdentity } from '../src/client/peer-identity/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';

await test('only definite own-authority refusals withdraw reused authority', () => {
  assert.equal(
    ownDirectoryRejected(
      new AccountError(403, 'Device has no current authorization.'),
    ),
    true,
  );
  assert.equal(
    ownDirectoryRejected(
      new AccountError(409, 'Device authorization changed. Check again.'),
    ),
    true,
  );
  for (const error of [
    new AccountError(403, 'Consent withdrawn.'),
    new AccountError(409, 'Quota reached.'),
    new AccountError(503, 'Device has no current authorization.'),
    new TypeError('Network failed.'),
  ])
    assert.equal(ownDirectoryRejected(error), false);
});

await test('own authority refusal in preparation retries once and a second refusal stops', async () => {
  let attempts = 0;
  const unreachable = () => assert.fail('No batch was prepared');
  await assert.rejects(
    sendPinnedBatch({
      prepare: () => {
        attempts++;
        return Promise.reject(new OwnDirectoryRequired());
      },
      preserve: unreachable,
      transmit: unreachable,
    }),
  );
  assert.equal(attempts, 2);
  attempts = 0;
  await assert.rejects(
    sendPinnedBatch({
      prepare: () => {
        attempts++;
        return Promise.reject(new AccountError(403, 'Consent withdrawn.'));
      },
      preserve: unreachable,
      transmit: unreachable,
    }),
  );
  assert.equal(attempts, 1);
});

await test('own authority refreshed after refusal still preserves pins before publication', async () => {
  const participant = await groupParticipant();
  const events: string[] = [];
  let attempts = 0;
  const batch = await PinnedSendBatch.prepare({
    authority: participant.authority,
    entries: [{ name: 'outbox:test', value: { id: 'test', peer: 'peer' } }],
    preparation: () => Promise.resolve({ history: [], recovery: null }),
  });
  await sendPinnedBatch({
    prepare: () => {
      events.push('prepare');
      if (++attempts === 1) return Promise.reject(new OwnDirectoryRequired());
      return Promise.resolve(batch);
    },
    preserve: () => {
      events.push('persist-pins');
      return Promise.resolve();
    },
    transmit: () => {
      events.push('publish');
      return Promise.resolve(true);
    },
  });
  assert.deepEqual(events, ['prepare', 'prepare', 'persist-pins', 'publish']);
});

await test('full group preparation leaves a reused own directory before requesting participants or keys', async () => {
  const owner = await groupParticipant();
  const access = {
    withVault: () => Promise.reject(new Error('Unexpected authority request')),
    withLocalVault: () =>
      Promise.reject(new Error('Unexpected storage request')),
  };
  const identities = new PeerIdentity(new VaultSync(access));
  const api = () =>
    assert.fail('Full preparation must acquire fresh own authority first');
  const authority = { ...owner.authority, reusedOwnDirectory: true as const };
  await assert.rejects(
    new GroupSendPreparation().prepare({
      groupId: crypto.randomUUID(),
      governance: new GroupGovernance(identities, api, authority),
      api,
      identities,
      authority,
    }),
    { code: 'fresh-own-directory-required' },
  );
});
