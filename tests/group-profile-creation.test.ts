import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupCache } from '../src/client/groups/cache.ts';
import { GroupCatalog } from '../src/client/groups/catalog.ts';
import { GroupController } from '../src/client/groups/controller.ts';
import { GroupGovernance } from '../src/client/groups/governance.ts';
import { PeerIdentity } from '../src/client/peer-identity/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import {
  stageCreationProfile,
  creationProfile,
} from '../src/client/groups/creation-profile.ts';
import { cachedGroupDescription } from '../src/client/groups/description.ts';
import { fixtureGroupPhoto } from './fixtures/group-photo.ts';
import { groupParticipant } from './fixtures/group-participant.ts';
import type { GroupEvent } from '../src/shared/groups/index.ts';
import type { GroupSummary } from '../src/client/groups/controller.ts';
import type { VaultAccess } from '../src/client/vault-authority/index.ts';

await test('initial description and photo are retained in the existing encrypted-profile outbox before the resumable creation is cleared', async (t) => {
  const owner = await groupParticipant(),
    id = crypto.randomUUID();
  const event = { groupId: id } as GroupEvent,
    profile = creationProfile('Synthetic', {
      description: 'Initial description',
      photo: fixtureGroupPhoto(),
    });
  const writes: { name: string; value: unknown }[] = [];
  let cleared = false;
  t.mock.method(GroupCache.prototype, 'get', () => Promise.resolve(null));
  t.mock.method(GroupCatalog.prototype, 'save', () => Promise.resolve());
  t.mock.method(GroupCatalog.prototype, 'clearCreation', () => {
    cleared = true;
    return Promise.resolve();
  });
  t.mock.method(GroupCache.prototype, 'put', (name: string, value: unknown) => {
    writes.push({ name, value });
    return Promise.resolve();
  });
  await stageCreationProfile(owner.authority, event, profile);
  assert.equal(cleared, true);
  const initial = writes.find((row) => row.name === 'profile')!.value as {
    description: string;
    photo: unknown;
  };
  assert.equal(initial.description, profile.description);
  assert.deepEqual(initial.photo, profile.photo);
  const draft = writes.find((row) => row.name === `outbox:${id}`)!.value as {
    kind: string;
    text: string;
  };
  assert.equal(draft.kind, 'profile');
  assert.deepEqual(JSON.parse(draft.text), profile);
  const stored = {
    kind: 'profile',
    text: JSON.stringify(profile),
    packet: { accepted: true },
  };
  t.mock.method(GroupCache.prototype, 'get', (name: string) =>
    Promise.resolve(name.startsWith('outbox:') ? stored : null),
  );
  const before = writes.length;
  await stageCreationProfile(owner.authority, event, profile);
  assert.equal(
    writes.slice(before).some((row) => row.name.startsWith('outbox:')),
    false,
    'Resuming cannot replace a staged packet',
  );
  t.mock.method(GroupCache.prototype, 'get', () => Promise.resolve(null));
  cleared = false;
  t.mock.method(GroupCache.prototype, 'put', (name: string) =>
    name.startsWith('outbox:')
      ? Promise.reject(new Error('Storage full'))
      : Promise.resolve(),
  );
  await assert.rejects(
    stageCreationProfile(owner.authority, event, profile),
    /Storage full/,
  );
  assert.equal(cleared, false);
});
await test('a current member without owner/admin authority cannot edit the encrypted description', async (t) => {
  const owner = await groupParticipant(),
    groupId = crypto.randomUUID();
  const access: VaultAccess = {
    withVault: (_offline, work) => work(owner.authority),
    withLocalVault: (_locator, work) => work(owner.authority),
  };
  t.mock.method(PeerIdentity.prototype, 'load', () => Promise.resolve());
  t.mock.method(PeerIdentity.prototype, 'save', () => Promise.resolve());
  t.mock.method(GroupGovernance.prototype, 'verify', () =>
    Promise.resolve({
      head: 'a'.repeat(64),
      state: {
        groupId,
        kind: 'create',
        members: [{ accountId: owner.accountId, role: 'member', joined: 1 }],
      },
    } as GroupSummary),
  );
  const previous = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  t.after(() => {
    if (previous) Object.defineProperty(navigator, 'onLine', previous);
    else Reflect.deleteProperty(navigator, 'onLine');
  });
  const controller = new GroupController(
    access,
    new VaultSync(access),
    () => false,
  );
  controller.setSession({ ...owner.authority.session } as Parameters<
    GroupController['setSession']
  >[0]);
  controller.selected = { state: { groupId } } as GroupSummary;
  await assert.rejects(
    controller.updateDescription({
      group: groupId,
      id: crypto.randomUUID(),
      description: 'Forged',
      sequence: 1,
    }),
    /Only the owner or administrator/,
  );
});
await test('description reads current private cache with its optimistic revision', async (t) => {
  const owner = await groupParticipant();
  t.mock.method(GroupCache.prototype, 'get', () =>
    Promise.resolve({
      version: 1,
      title: 'Synthetic',
      description: 'Cached',
      sequence: 8,
    }),
  );
  const result = await cachedGroupDescription(owner.authority, {
    state: { groupId: crypto.randomUUID() },
  });
  assert.deepEqual(result, { description: 'Cached', sequence: 8 });
});
