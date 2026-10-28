import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { resumeFixture } from './fixtures/message-resume.ts';
import { AuthorityWork } from '../src/client/devices/authority-work.ts';
import { deferred } from './fixtures/deferred.ts';
import type { VaultAccess } from '../src/client/vault-authority/index.ts';
import type { VaultWorkOptions } from '../src/client/vault-authority/index.ts';

await test('restoring outgoing text uses current authority and excludes other recipients, attachments and message actions', async () => {
  const { controller, data, peer } = resumeFixture();
  const input = {
    id: 'own-text',
    peer,
    kind: 'text',
    draft: [{ text: 'Own pending content' }],
    createdAt: 1700000000000,
  };
  data.records.set('outbox:own-text', input);
  data.records.set('outbox:other', { ...input, id: 'other', peer: 'another' });
  data.records.set('outbox:media', {
    ...input,
    id: 'media',
    kind: 'attachment',
  });
  data.records.set('outbox:action', {
    ...input,
    id: 'action',
    relation: { type: 'edit' },
  });
  const before = data.authorityReads;
  const drafts = await controller.pendingTexts(peer, [
    'own-text',
    'other',
    'media',
    'action',
  ]);
  assert.equal(data.authorityReads, before + 1);
  assert.deepEqual(
    Array.from(drafts, (draft) => ({ ...draft })),
    [
      {
        id: 'own-text',
        peer,
        text: 'Own pending content',
        createdAt: 1700000000000,
      },
    ],
  );
});

await test('session replacement during a pending-text restore prevents publishing decrypted content', async () => {
  const { controller, data, peer, session } = resumeFixture();
  data.records.set('outbox:stale', {
    id: 'stale',
    peer,
    kind: 'text',
    draft: [{ text: 'Old account draft' }],
  });
  data.beforeLocalOpen = () =>
    controller.setSession({ ...session, csrf: 'd'.repeat(64) });
  await assert.rejects(controller.pendingTexts(peer, ['stale']), /[Ss]ession/u);
});

await test('reopening a confirmed window validates delivery and its snapshot with one current authority', async () => {
  const { controller, data, add, peer } = resumeFixture();
  await add('Já confirmada');
  await controller.synchronize();
  controller.select(peer);
  const before = data.authorityReads;
  assert.equal(await controller.probe(), false);
  assert.equal(data.authorityReads - before, 1);
  assert.equal(data.frames.at(-1)?.[0]?.text, 'Já confirmada');
});

await test('connected session restores a previously confirmed conversation immediately without authority or history IO', async () => {
  const f = resumeFixture(),
    other = crypto.randomUUID();
  f.controller.setLiveConnected(true);
  await f.add('Previously verified first conversation');
  await f.add('Previously verified second conversation', other);
  await f.controller.synchronize();
  f.controller.select(other);
  await f.controller.synchronize();
  for (const selected of [f.peer, other, f.peer]) {
    assert.equal(f.controller.canRestore(selected), true);
    const calls = f.data.requests.length,
      reads = f.data.authorityReads;
    f.controller.select(selected);
    assert.equal(f.controller.restoreSelected(), true);
    assert.equal(f.data.frames.at(-1)?.[0]?.peer, selected);
    assert.equal(f.data.requests.length, calls);
    assert.equal(f.data.authorityReads, reads);
  }
  assert.equal(
    await f.controller.probe(),
    false,
    'Background revalidation remains available',
  );
});

await test('A to B to A remains reusable through directory-only pauses while the live session is current', async () => {
  const f = resumeFixture(),
    other = crypto.randomUUID();
  f.controller.setLiveConnected(true);
  await f.add('Verified first conversation');
  await f.add('Verified second conversation', other);
  await f.controller.synchronize();
  f.controller.select(other);
  await f.controller.synchronize();
  const requests = f.data.requests.length;
  for (const peer of [f.peer, other, f.peer]) {
    f.controller.pause('conversation');
    assert.equal(f.data.frames.at(-1), null, 'The hidden chat remains hidden');
    assert.equal(f.controller.canRestore(peer), true);
    f.controller.select(peer);
    assert.equal(f.controller.restoreSelected(), true);
    assert.equal(f.data.frames.at(-1)?.[0]?.peer, peer);
  }
  assert.equal(f.data.requests.length, requests);
});

await test('A to B to A keeps navigation available with large verified profile photos and still authenticates their hashes', async () => {
  const f = resumeFixture(),
    other = crypto.randomUUID();
  f.controller.setLiveConnected(true);
  const text = JSON.stringify({
    name: 'Synthetic profile',
    revision: 1,
    photo: {
      type: 'image/png',
      base64: Buffer.alloc(1024 * 1024, 1).toString('base64'),
    },
  });
  for (const peer of [f.peer, other]) {
    for (let index = 0; index < 16; index++)
      await f.add(`Small message ${index}`, peer);
    await f.addProfile(text, peer);
    await f.addProfile(text, peer, true);
  }
  for (const peer of [f.peer, other]) {
    f.controller.select(peer);
    let next = await f.controller.synchronize();
    while (next) next = await next.resume();
  }
  const requests = f.data.requests.length,
    reads = f.data.authorityReads;
  for (const peer of [f.peer, other, f.peer]) {
    assert.equal(f.controller.canRestore(peer), true);
    f.controller.select(peer);
    assert.equal(f.controller.restoreSelected(), true);
    const restored = f.data.frames.at(-1)!;
    assert.equal(restored.filter((view) => view.kind === 'text').length, 16);
    assert.equal(restored.filter((view) => view.kind === 'profile').length, 2);
    assert.ok(
      restored
        .filter((view) => view.kind === 'profile')
        .every((view) => view.text === ''),
    );
  }
  assert.equal(f.data.requests.length, requests);
  assert.equal(f.data.authorityReads, reads);
  assert.equal(
    await f.controller.probe(),
    false,
    'Metadata-only profiles still participate in authenticated delivery checking',
  );
  const profile = f.data.items.find(
    (item) => item.kind === 'profile' && item.sender === f.peer,
  )!;
  profile.hash = 'e'.repeat(64);
  await assert.rejects(f.controller.probe(), /Delivery state does not match/u);
  assert.equal(f.data.frames.at(-1), null);
  assert.equal(f.controller.canRestore(f.peer), false);
});

await test('a live hint blocks retained navigation until the current snapshot is authenticated again', async () => {
  const f = resumeFixture(),
    other = crypto.randomUUID();
  f.controller.setLiveConnected(true);
  await f.add('Verified first conversation');
  await f.add('Verified second conversation', other);
  await f.controller.synchronize();
  f.controller.select(other);
  await f.controller.synchronize();
  f.controller.hint();
  assert.equal(f.controller.canRestore(f.peer), false);
  assert.equal(f.controller.canRestore(other), false);
  assert.equal(await f.controller.probe(), false);
  assert.equal(f.controller.canRestore(f.peer), true);
  f.controller.select(f.peer);
  const requests = f.data.requests.length;
  assert.equal(f.controller.restoreSelected(), true);
  assert.equal(f.data.requests.length, requests);
});

await test('same-session profile name and revision changes invalidate navigation without resetting the account', async () => {
  const f = resumeFixture();
  f.controller.setLiveConnected(true);
  await f.add('Verified conversation');
  await f.controller.synchronize();
  f.controller.setSession({ ...f.session });
  assert.equal(f.controller.canRestore(f.peer), true);
  const updated = {
    ...f.session,
    profileRevision: f.session.profileRevision + 1,
  };
  f.controller.setSession(updated);
  assert.equal(f.controller.canRestore(f.peer), false);
  await f.controller.synchronize();
  assert.equal(f.controller.canRestore(f.peer), true);
  f.controller.setSession({ ...updated, name: 'Updated synthetic profile' });
  assert.equal(f.controller.canRestore(f.peer), false);
});

await test('a newly verified different snapshot cannot restore an older conversation window', async () => {
  const f = resumeFixture(),
    other = crypto.randomUUID();
  f.controller.setLiveConnected(true);
  await f.add('Verified earlier conversation');
  await f.controller.synchronize();
  f.data.snapshot.revision++;
  await f.add('New snapshot conversation', other);
  f.controller.select(other);
  await f.controller.synchronize();
  assert.equal(f.controller.canRestore(f.peer), false);
  assert.equal(f.controller.canRestore(other), true);
});

for (const cause of [
  'pause',
  'removed',
  'hide',
  'disconnect',
  'session',
  'failure',
] as const)
  await test(`retained conversation cannot bypass the gate after ${cause}`, async () => {
    const f = resumeFixture();
    f.controller.setLiveConnected(true);
    await f.add('Validated only in the original connected epoch');
    await f.controller.synchronize();
    assert.equal(f.controller.canRestore(f.peer), true);
    if (cause === 'disconnect') {
      f.controller.setLiveConnected(false);
      f.controller.setLiveConnected(true);
    } else if (cause === 'session')
      f.controller.setSession({ ...f.session, csrf: 'e'.repeat(64) });
    else if (cause === 'failure') {
      f.data.failure = 'delivery';
      await assert.rejects(f.controller.probe());
    } else f.controller[cause]();
    assert.equal(f.controller.canRestore(f.peer), false);
    f.controller.select(f.peer);
    assert.equal(f.controller.restoreSelected(), false);
    assert.equal(f.data.frames.at(-1), null);
  });

await test('session change during profile preparation prevents checking or sending through the new account', async () => {
  const { controller, data, session, peer } = resumeFixture();
  data.beforeLocalRead = (name) => {
    if (name.startsWith('profile-sent:'))
      controller.setSession({ ...session, csrf: 'd'.repeat(64) });
  };
  await assert.rejects(
    controller.shareProfile(peer, {
      name: 'Synthetic',
      revision: 1,
      photo: null,
    }),
    /[Ss]ession/,
  );
  assert.equal(data.authorityReads, 0);
  assert.equal(data.requests.length, 0);
});

await test('sending after selecting a retained window requires current identities before key distribution or publication', async () => {
  const { controller, data, peer } = resumeFixture();
  data.records.set('outbox:pending', {
    id: 'pending',
    peer,
    kind: 'text',
    draft: [],
    packet: null,
  });
  const failure = new Error('Identidades indisponíveis');
  controller.loadPins = (options = {}) => {
    assert.equal(options.priority, 'interactive');
    return Promise.reject(failure);
  };
  await assert.rejects(
    controller.sendPending({ priority: 'interactive' }),
    (error: unknown) => error === failure,
  );
  assert.equal(data.authorityReads, 0);
  assert.equal(data.requests.length, 0);
});

await test('unchanged resumes check state and delivery and confirm without rereading index or content', async () => {
  const { controller, data, add } = resumeFixture();
  await add('Mensagem já carregada');
  await controller.synchronize();
  assert.equal(data.frames.at(-1)?.[0]?.text, 'Mensagem já carregada');
  for (let resume = 0; resume < 3; resume++) {
    controller.pause();
    assert.equal(data.frames.at(-1), null);
    const before = data.requests.length;
    assert.equal(await controller.probe(), false);
    assert.deepEqual(data.requests.slice(before), ['delivery']);
    assert.equal(data.frames.at(-1)?.[0]?.text, 'Mensagem já carregada');
  }
  assert.equal(data.requests.filter((op) => op === 'page').length, 1);
  assert.equal(data.cacheReads.length, 1);
});

await test('new message requires an update, preserves the old window and reuses its verified content', async () => {
  const { controller, data, add } = resumeFixture();
  const first = await add('Primeira');
  await controller.synchronize();
  data.snapshot.revision++;
  const second = await add('Nova mensagem');
  controller.hint();
  assert.equal(await controller.probe(), true);
  assert.equal(data.frames.at(-1)?.length, 1);
  await controller.synchronize();
  assert.deepEqual(
    data.frames.at(-1)?.map((row) => row.text),
    ['Primeira', 'Nova mensagem'],
  );
  assert.equal(
    data.cacheReads.filter((name) => name === `cache:${first.id}`).length,
    1,
  );
  assert.equal(
    data.cacheReads.filter((name) => name === `cache:${second.id}`).length,
    1,
  );
  assert.equal(data.requests.filter((op) => op === 'page').length, 2);
});

await test('change during pause cannot reopen the previous view before a complete update', async () => {
  const { controller, data, add } = resumeFixture();
  await add('Antiga');
  await controller.synchronize();
  controller.pause();
  data.snapshot.revision++;
  await add('Recebida na pausa');
  assert.equal(await controller.probe(), true);
  assert.equal(data.frames.at(-1), null);
  await controller.synchronize();
  assert.equal(data.frames.at(-1)?.length, 2);
});

await test('deletion, invalidation and session change discard reuse even if the returned snapshot matches', async () => {
  for (const invalidate of ['hide', 'close', 'session'] as const) {
    const { controller, data, add, session } = resumeFixture();
    await add('Histórico confirmado');
    await controller.synchronize();
    if (invalidate === 'session')
      controller.setSession({ ...session, csrf: 'd'.repeat(64) });
    else controller[invalidate]();
    assert.equal(data.frames.at(-1), null);
    assert.equal(await controller.probe(), true);
    assert.equal(data.frames.at(-1), null);
    await controller.synchronize();
    assert.equal(data.requests.filter((op) => op === 'page').length, 2);
    assert.equal(data.cacheReads.length, 2);
  }
});

await test('check or confirmation failure closes history and blocks fallback to the retained window', async () => {
  for (const operation of ['snapshot', 'delivery', 'confirm']) {
    const { controller, data, add } = resumeFixture();
    await add('Histórico confirmado');
    await controller.synchronize();
    controller.pause();
    if (operation !== 'delivery') controller.hide();
    data.failure = operation;
    await assert.rejects(async () => {
      if (await controller.probe()) await controller.synchronize();
    }, /Not authorized|No verified local authorization/);
    assert.equal(data.frames.at(-1), null);
    data.failure = null;
    assert.equal(await controller.probe(), true);
    assert.equal(data.frames.at(-1), null);
  }
});

await test('pause during confirmation cancels publication and cannot turn in-progress data into reusable history', async () => {
  const { controller, data, add } = resumeFixture();
  await add('Ainda em conferência');
  let release: (() => void) | undefined;
  data.confirmation = () =>
    new Promise<Response>((resolve) => {
      release = () => resolve(Response.json({}));
    });
  const loading = controller.synchronize();
  const rejected = assert.rejects(loading, {
    name: 'WorkInterruption',
    origin: 'authorization',
  });
  const deadline = Date.now() + 2000;
  while (!release && Date.now() < deadline) await setImmediate();
  assert.ok(release, 'A leitura não chegou à confirmação dentro do prazo.');
  controller.pause();
  release();
  await rejected;
  assert.ok(data.frames.every((rows) => rows === null));
  data.confirmation = null;
  assert.equal(await controller.probe(), true);
  assert.equal(data.frames.at(-1), null);
});

await test('switching confirmed conversations checks snapshot and delivery without rereading index, relations or cache', async () => {
  const { controller, data, add, peer } = resumeFixture();
  const other = crypto.randomUUID();
  await add('Primeira conversa');
  await add('Segunda conversa', other);
  await controller.synchronize();
  controller.select(other);
  assert.equal(data.frames.at(-1), null);
  assert.equal(await controller.probe(), true);
  await controller.synchronize();
  assert.equal(data.frames.at(-1)?.[0]?.text, 'Segunda conversa');
  for (const selected of [peer, other, peer]) {
    controller.select(selected);
    assert.equal(data.frames.at(-1), null);
    const before = data.requests.length;
    assert.equal(await controller.probe(), false);
    assert.deepEqual(data.requests.slice(before), ['delivery']);
    assert.equal(data.frames.at(-1)?.[0]?.peer, selected);
  }
  assert.equal(data.requests.filter((op) => op === 'page').length, 1);
  assert.equal(data.requests.filter((op) => op === 'relations').length, 2);
  assert.equal(data.cacheReads.length, 2);
});

await test('probe provides the snapshot for the next load without repeating the request', async () => {
  const { controller, data, add } = resumeFixture();
  await add('Nova');
  assert.equal(await controller.probe(), true);
  await controller.synchronize();
  assert.equal(data.requests.filter((op) => op === 'snapshot').length, 1);
  assert.equal(data.frames.at(-1)?.[0]?.text, 'Nova');
});

await test('preparation with no selected conversation makes all content ready before the first click', async () => {
  const { controller, data, add, peer } = resumeFixture(true);
  const other = crypto.randomUUID();
  await add('Primeira conversa');
  await add('Segunda conversa', other);
  controller.select(null);
  assert.equal(
    await controller.synchronizeAll(new AbortController().signal),
    true,
  );
  assert.equal(data.frames.at(-1), null);
  assert.equal(
    data.cacheReads.filter((name) => name.startsWith('cache:')).length,
    2,
  );
  const before = data.requests.length;
  for (const selected of [peer, other]) {
    controller.select(selected);
    assert.equal(await controller.probe(), true);
    await controller.synchronize();
    assert.equal(data.frames.at(-1)?.[0]?.peer, selected);
  }
  assert.ok(!data.requests.slice(before).includes('page'));
  assert.ok(!data.requests.includes('backup-window'));
});

await test('a cached conversation receives only new packets after a switch and keeps unrelated conversations reusable', async () => {
  const f = resumeFixture(),
    other = crypto.randomUUID();
  f.controller.setLiveConnected(true);
  await f.add('First conversation');
  await f.add('Second conversation', other);
  await f.controller.synchronize();
  f.controller.select(other);
  await f.controller.synchronize();
  f.data.snapshot.revision++;
  const added = await f.add('New incoming message');
  f.data.changes = [added];
  f.controller.hint();
  f.controller.select(f.peer);
  const reads = f.data.cacheReads.length,
    requests = f.data.requests.length;
  assert.equal(await f.controller.probe(), true);
  await f.controller.synchronize();
  assert.deepEqual(f.data.cacheReads.slice(reads), [`cache:${added.id}`]);
  assert.ok(!f.data.requests.slice(requests).includes('page'));
  assert.ok(!f.data.requests.slice(requests).includes('relations'));
  assert.equal(f.controller.canRestore(other), true);
  assert.deepEqual(
    f.data.frames.at(-1)?.map((row) => row.text),
    ['First conversation', 'New incoming message'],
  );
});

await test('a removal hint retains candidates but cannot expose them before current confirmation', async () => {
  const f = resumeFixture(),
    other = crypto.randomUUID();
  f.controller.setLiveConnected(true);
  await f.add('First conversation');
  await f.add('Second conversation', other);
  await f.controller.synchronize();
  f.controller.select(other);
  await f.controller.synchronize();
  f.data.snapshot.revision++;
  f.data.changes = [];
  const requests = f.data.requests.length,
    reads = f.data.cacheReads.length;
  f.controller.removed();
  assert.equal(f.data.frames.at(-1), null);
  assert.equal(f.controller.canRestore(f.peer), false);
  assert.equal(await f.controller.probe(), true);
  await f.controller.synchronize();
  assert.equal(f.data.cacheReads.length, reads);
  assert.ok(!f.data.requests.slice(requests).includes('page'));
  assert.ok(!f.data.requests.slice(requests).includes('relations'));
  assert.equal(f.controller.canRestore(f.peer), true);
  assert.equal(f.controller.canRestore(other), true);
});

await test('an incremental result rejected at final confirmation closes history and cannot authorize navigation', async () => {
  const f = resumeFixture();
  f.controller.setLiveConnected(true);
  await f.add('Already verified');
  await f.controller.synchronize();
  f.data.snapshot.revision++;
  f.data.changes = [await f.add('Unconfirmed update')];
  f.controller.hint();
  assert.equal(await f.controller.probe(), true);
  f.data.failure = 'confirm';
  await assert.rejects(f.controller.synchronize());
  assert.equal(f.data.frames.at(-1), null);
  assert.equal(f.controller.canRestore(f.peer), false);
  assert.ok(
    !f.data.frames.some((frame) =>
      frame?.some((row) => row.text === 'Unconfirmed update'),
    ),
  );
});

await test('deletion and failure also discard other retained conversations', async () => {
  for (const cause of ['hide', 'delivery'] as const) {
    const { controller, data, add, peer } = resumeFixture();
    const other = crypto.randomUUID();
    await add('Primeira');
    await add('Segunda', other);
    await controller.synchronize();
    controller.select(other);
    await controller.synchronize();
    if (cause === 'hide') controller.hide();
    else {
      data.failure = 'delivery';
      await assert.rejects(
        controller.probe(),
        /Not authorized|No verified local authorization/,
      );
      data.failure = null;
    }
    controller.select(peer);
    assert.equal(await controller.probe(), true);
    assert.equal(data.frames.at(-1), null);
  }
});

await test("another conversation's candidate with an old snapshot returns only after update and confirmation", async () => {
  const { controller, data, add, peer } = resumeFixture();
  const other = crypto.randomUUID();
  await add('Primeira');
  await add('Segunda', other);
  await controller.synchronize();
  controller.select(other);
  await controller.synchronize();
  data.snapshot.revision++;
  await add('Nova na primeira');
  controller.select(peer);
  assert.equal(await controller.probe(), true);
  assert.equal(data.frames.at(-1), null);
  await controller.synchronize();
  assert.deepEqual(
    data.frames.at(-1)?.map((row) => row.text),
    ['Primeira', 'Nova na primeira'],
  );
});

await test('snapshot changed between probe and load rejects publication even with prepared content', async () => {
  const { controller, data, add } = resumeFixture();
  await add('Fictícia');
  assert.equal(await controller.probe(), true);
  data.snapshot.revision++;
  await assert.rejects(
    controller.synchronize(),
    /Messages or permissions changed|Estado alterado/,
  );
  assert.equal(data.frames.at(-1), null);
});

await test('large history continues its partially checked index on resume instead of restarting', async () => {
  const { controller, data, add } = resumeFixture();
  for (let index = 0; index < 144; index++) await add(`Fictícia ${index}`);
  const pending = await controller.synchronize();
  assert.ok(pending);
  assert.equal(data.frames.at(-1), null);
  assert.equal(data.requests.filter((op) => op === 'page').length, 1);
  controller.pause();
  let next = await controller.synchronize();
  while (next) next = await next.resume();
  assert.equal(data.requests.filter((op) => op === 'page').length, 9);
  assert.equal(data.frames.at(-1)?.length, 16);
  assert.equal(data.frames.at(-1)?.[0]?.text, 'Fictícia 128');
});

await test('editing one message queries only the delta, reuses content and preserves another confirmed conversation', async () => {
  const { controller, data, add, peer } = resumeFixture(),
    other = crypto.randomUUID();
  const original = await add('Original');
  await add('Intacta');
  await add('Outra conversa', other);
  await controller.synchronize();
  controller.select(other);
  await controller.synchronize();
  controller.select(peer);
  assert.equal(await controller.probe(), false);
  await controller.synchronize();
  data.snapshot.revision++;
  const edit = await add('Versão editada', peer, {
    id: original.id,
    hash: original.hash,
    author: peer,
    type: 'edit',
  });
  data.changes = [edit];
  const before = data.requests.length,
    reads = data.cacheReads.length;
  controller.hint();
  assert.equal(await controller.probe(), true);
  await controller.synchronize();
  assert.ok(data.requests.slice(before).includes('changes'));
  assert.ok(!data.requests.slice(before).includes('page'));
  assert.ok(!data.requests.slice(before).includes('relations'));
  assert.deepEqual(data.cacheReads.slice(reads), [`cache:${edit.id}`]);
  assert.equal(data.frames.at(-1)?.length, 3);
  controller.select(other);
  const navigation = data.requests.length;
  assert.equal(await controller.probe(), false);
  assert.deepEqual(data.requests.slice(navigation), ['delivery']);
  assert.equal(data.frames.at(-1)?.[0]?.text, 'Outra conversa');
});

await test('complete preparation queries only changes without rereading intact messages', async () => {
  const { controller, data, add } = resumeFixture(true);
  await add('Preservada');
  controller.select(null);
  const signal = new AbortController().signal;
  await controller.synchronizeAll(signal);
  data.snapshot.revision++;
  const added = await add('Nova');
  data.changes = [added];
  const before = data.requests.length,
    reads = data.cacheReads.length;
  await controller.synchronizeAll(signal);
  assert.deepEqual(data.requests.slice(before), [
    'snapshot',
    'changes',
    'confirm',
  ]);
  assert.deepEqual(
    data.cacheReads.slice(reads).filter((name) => name.startsWith('cache:')),
    [`cache:${added.id}`],
  );
});

await test('deletion failure keeps the gate closed and discards retained candidates', async () => {
  const { controller, data, add } = resumeFixture();
  await add('Confirmada');
  await controller.synchronize();
  const view = data.frames.at(-1)![0]!;
  data.failure = 'delete';
  await assert.rejects(
    controller.remove(view),
    /Not authorized|No verified local authorization/,
  );
  assert.equal(data.frames.at(-1), null);
  data.failure = null;
  assert.equal(await controller.probe(), true);
  await controller.synchronize();
  assert.equal(data.requests.filter((op) => op === 'page').length, 2);
});

for (const interactive of [false, true])
  await test(`selected history preserves authority queue priority through final confirmation: interactive=${interactive}`, async (t) => {
    const f = resumeFixture();
    await f.add('Verified selected history');
    const native = f.access.withVault;
    const orders: string[][] = [];
    const scheduled: VaultAccess['withVault'] = async (
      offline,
      work,
      options,
    ) => {
      const queue = new AuthorityWork(),
        held = deferred<void>(),
        order: string[] = [];
      orders.push(order);
      const blocker = queue.run(() => held.promise);
      const maintenance = queue.run(() => {
        order.push('maintenance');
        return Promise.resolve();
      });
      const read = queue.run(() => {
        order.push('history');
        return native(offline, work);
      }, options?.priority);
      held.resolve();
      const value = await read;
      await Promise.all([blocker, maintenance]);
      return value;
    };
    t.mock.method(f.access, 'withVault', scheduled);
    // Model a pending encrypted pin write at the existing persistence boundary,
    // so the test also catches a priority dropped between reading and exposing.
    const savePins = f.controller.savePins.bind(f.controller);
    t.mock.method(f.controller, 'savePins', (options: VaultWorkOptions = {}) =>
      scheduled(false, () => savePins(options), options),
    );
    await f.controller.synchronize(
      interactive ? { priority: 'interactive' } : {},
    );
    assert.equal(f.data.frames.at(-1)?.[0]?.text, 'Verified selected history');
    assert.ok(
      orders.length > 1,
      'History and final confirmation retain independent fresh authorities',
    );
    for (const order of orders)
      assert.deepEqual(
        order,
        interactive ? ['history', 'maintenance'] : ['maintenance', 'history'],
      );
    assert.equal(f.data.requests.at(-1), 'confirm');
  });

await test('selected content and delivery share one read while exposure requires a separate fresh confirmation', async (t) => {
  const f = resumeFixture();
  await f.add('Verified complete projection');
  const native = f.access.withVault;
  const boundaries: { requests: string[]; hidden: boolean }[] = [];
  const read: VaultAccess['withVault'] = (offline, work, options) => {
    boundaries.push({
      requests: [...f.data.requests],
      hidden: f.data.frames.at(-1) == null,
    });
    return native(offline, work, options);
  };
  t.mock.method(f.access, 'withVault', read);
  await f.controller.synchronize({ priority: 'interactive' });
  assert.equal(
    boundaries.length,
    2,
    'One complete read and one independent fresh confirmation',
  );
  assert.ok(
    boundaries[1]!.requests.includes('delivery'),
    'Delivery was checked before requesting final authority',
  );
  assert.ok(
    !boundaries[1]!.requests.includes('confirm'),
    'Confirmation uses the new authority',
  );
  assert.ok(
    boundaries.every((boundary) => boundary.hidden),
    'No history is exposed before the fresh confirmation',
  );
  assert.equal(f.data.frames.at(-1)?.[0]?.text, 'Verified complete projection');
});

await test('revocation at final authority rejects the complete projection before exposing any history', async (t) => {
  const f = resumeFixture();
  await f.add('Must stay hidden');
  const native = f.access.withVault;
  let calls = 0;
  const read: VaultAccess['withVault'] = (offline, work, options) => {
    if (++calls === 2)
      return Promise.reject(new Error('Revoked final authority'));
    return native(offline, work, options);
  };
  t.mock.method(f.access, 'withVault', read);
  await assert.rejects(f.controller.synchronize(), /Revoked final authority/u);
  assert.ok(f.data.requests.includes('delivery'));
  assert.ok(!f.data.requests.includes('confirm'));
  assert.equal(f.data.frames.at(-1), null);
});

for (const interactive of [false, true])
  await test(`pending publication keeps its requested authority priority and stops before unverified peer IO: interactive=${interactive}`, async (t) => {
    const f = resumeFixture();
    f.data.records.set('outbox:pending', {
      id: 'pending',
      peer: f.peer,
      kind: 'text',
      draft: [],
      packet: null,
    });
    f.controller.loadPins = () => Promise.resolve();
    const failure = new Error('Current authority unavailable');
    const read: VaultAccess['withVault'] = (_offline, _work, options) => {
      assert.equal(options?.priority, interactive ? 'interactive' : undefined);
      return Promise.reject(failure);
    };
    t.mock.method(f.access, 'withVault', read);
    await assert.rejects(
      f.controller.sendPending(interactive ? { priority: 'interactive' } : {}),
      (error: unknown) => error === failure,
    );
    assert.equal(f.data.requests.length, 0);
  });

await test('unselected directory preview restarts from fresh authority when receipt changes the delivery snapshot', async () => {
  const { controller, data, peer, add } = resumeFixture();
  controller.select(null);
  await add('Latest inbox message');
  data.beforeDelivery = () => {
    data.beforeDelivery = undefined;
    data.snapshot = { ...data.snapshot, revision: 2 };
  };
  const previews = await controller.directoryPreviews([peer]);
  assert.equal(previews.get(peer)?.text, 'Latest inbox message');
  assert.equal(
    data.requests.filter((operation) => operation === 'snapshot').length,
    2,
  );
  assert.equal(
    data.frames.some((frame) => frame?.length),
    false,
  );
  assert.equal(data.requests.includes('daily-read'), false);
});

await test('headless private notification reads the exact verified message without selecting a conversation or marking read', async () => {
  const f = resumeFixture();
  const item = await f.add('Current private notification');
  const abort = new AbortController();
  const reader = f.notificationReader(abort.signal);
  assert.equal(
    await reader.read(f.peer, item.id),
    'Current private notification',
  );
  assert.equal(
    f.data.requests.includes('page'),
    false,
    'No global message sweep',
  );
  assert.equal(f.data.requests.includes('daily-read'), false);
  assert.equal(
    f.data.frames.some((rows) => rows?.length),
    false,
  );
  assert.equal(
    await reader.read(f.peer, crypto.randomUUID()),
    null,
    'An older unread locator cannot reuse another message',
  );
  abort.abort();
  await assert.rejects(reader.read(f.peer, item.id));
  reader.close();
});

await test('late confirmation from A cannot replace a restored B or discard valid C', async () => {
  const f = resumeFixture(true),
    b = crypto.randomUUID(),
    c = crypto.randomUUID();
  f.controller.setLiveConnected(true);
  for (const peer of [f.peer, b, c]) await f.add('Synthetic', peer);
  for (const peer of [f.peer, b, c]) {
    f.controller.select(peer);
    await f.controller.synchronize();
  }
  f.controller.select(f.peer);
  const gate = deferred<Response>(),
    entered = deferred<void>();
  f.data.confirmation = () => {
    entered.resolve();
    return gate.promise;
  };
  const loading = f.controller.synchronize();
  const rejected = assert.rejects(loading, {
    name: 'WorkInterruption',
    origin: 'navigation',
  });
  await entered.promise;
  f.controller.select(b);
  assert.equal(f.controller.restoreSelected(), true);
  gate.resolve(Response.json({}));
  await rejected;
  assert.ok(f.data.frames.at(-1)?.every((row) => row.peer === b));
  assert.equal(f.controller.canRestore(c), true);
});
await test('late authorization denial still closes current account access after a selection change', async () => {
  const f = resumeFixture(true),
    b = crypto.randomUUID();
  f.controller.setLiveConnected(true);
  for (const peer of [f.peer, b]) await f.add('Synthetic', peer);
  for (const peer of [f.peer, b]) {
    f.controller.select(peer);
    await f.controller.synchronize();
  }
  f.controller.select(f.peer);
  const gate = deferred<Response>(),
    entered = deferred<void>();
  f.data.confirmation = () => {
    entered.resolve();
    return gate.promise;
  };
  const loading = f.controller.synchronize();
  const rejected = assert.rejects(loading);
  await entered.promise;
  f.controller.select(b);
  assert.equal(f.controller.restoreSelected(), true);
  gate.resolve(Response.json({ error: 'Denied' }, { status: 403 }));
  await rejected;
  assert.equal(f.data.frames.at(-1), null);
  assert.equal(f.controller.canRestore(b), false);
});

await test('opening a conversation on a finite cut reads its bounded window instead of every account page', async () => {
  const { controller, data, add } = resumeFixture(true),
    other = crypto.randomUUID();
  for (let n = 0; n < 200; n++) await add(`Other ${n}`, other);
  for (let n = 0; n < 20; n++) await add(`Selected ${n}`);
  await controller.synchronize();
  assert.deepEqual(
    data.frames.at(-1)?.map((row) => row.text),
    Array.from({ length: 16 }, (_, n) => `Selected ${n + 4}`),
  );
  assert.equal(data.requests.filter((op) => op === 'page').length, 0);
  assert.equal(
    data.requests.filter((op) => op === 'sync-peer-window').length,
    1,
  );
  assert.equal(data.requests.filter((op) => op === 'snapshot').length, 1);
});

await test('ordinary arrivals during final confirmation publish the verified finite cut once', async () => {
  const f = resumeFixture(true);
  await f.add('Verified finite cut');
  f.data.confirmation = () => {
    f.controller.appended();
    return Promise.resolve(Response.json({}));
  };
  await f.controller.synchronize();
  assert.equal(f.data.requests.filter((op) => op === 'confirm').length, 1);
  const published = f.data.frames.filter((rows) => rows !== null);
  assert.equal(published.length, 1);
  assert.equal(published[0]?.[0]?.text, 'Verified finite cut');
});

await test('session replacement while opening an imported archive never exposes its history', async () => {
  const f = resumeFixture();
  f.data.history.push({
    type: 'message',
    id: crypto.randomUUID(),
    hash: 'c'.repeat(64),
    peer: f.peer,
    own: false,
    sequence: 1,
    kind: 'text',
    text: 'Imported history',
  });
  f.data.beforeHistory = () =>
    f.controller.setSession({ ...f.session, csrf: 'e'.repeat(64) });
  await assert.rejects(f.controller.openArchive(f.peer), /[Ss]ession/u);
  assert.ok(f.data.frames.every((rows) => rows === null));
});

await test('offline opening merges the local cache and imported archive without remote confirmation', async () => {
  const f = resumeFixture();
  f.data.offline = true;
  const id = crypto.randomUUID();
  f.data.records.set(`cache:${id}`, {
    id,
    peer: f.peer,
    own: false,
    sequence: 2,
    hash: 'c'.repeat(64),
    text: 'Local cached content',
    bytes: new Uint8Array(),
    kind: 'text',
  });
  f.data.history.push({
    type: 'message',
    id: crypto.randomUUID(),
    hash: 'd'.repeat(64),
    peer: f.peer,
    own: false,
    sequence: 1,
    kind: 'text',
    text: 'Imported history',
  });
  await f.controller.openOffline(f.peer);
  assert.deepEqual(
    f.data.frames.at(-1)?.map((row) => row.text),
    ['Imported history', 'Local cached content'],
  );
  assert.equal(f.data.frames.at(-1)?.[0]?.archived, true);
  assert.equal(f.data.requests.length, 0);
});

await test('session replacement during offline decryption keeps all local history hidden', async () => {
  const f = resumeFixture();
  f.data.offline = true;
  const id = crypto.randomUUID();
  f.data.records.set(`cache:${id}`, {
    id,
    peer: f.peer,
    own: false,
    sequence: 1,
    hash: 'c'.repeat(64),
    text: 'Must stay hidden',
    bytes: new Uint8Array(),
    kind: 'text',
  });
  f.data.beforeLocalOpen = () =>
    f.controller.setSession({ ...f.session, csrf: 'f'.repeat(64) });
  await assert.rejects(f.controller.openOffline(f.peer), /[Ss]ession/u);
  assert.ok(f.data.frames.every((rows) => rows === null));
});

await test('account receipt updates the selected window only after final confirmation and a durable checkpoint', async () => {
  const f = resumeFixture(true);
  f.controller.setLiveConnected(true);
  await f.add('Already verified');
  await f.controller.synchronize();
  await f.add('Received in background');
  const gate = deferred<Response>(),
    entered = deferred<void>();
  f.data.confirmation = () => {
    entered.resolve();
    return gate.promise;
  };
  const receiving = f.controller.synchronizeAll(new AbortController().signal);
  await entered.promise;
  assert.deepEqual(
    f.data.frames.at(-1)?.map((row) => row.text),
    ['Already verified'],
  );
  assert.equal(f.data.receipts.length, 0);
  assert.ok(!f.data.records.has(`sync-progress:v2:${f.session.deviceId}`));
  gate.resolve(Response.json({}));
  await receiving;
  assert.deepEqual(
    f.data.frames.at(-1)?.map((row) => row.text),
    ['Already verified', 'Received in background'],
  );
  assert.ok(f.data.records.has(`sync-progress:v2:${f.session.deviceId}`));
  assert.equal(f.data.receipts.length, 1);
  assert.equal(f.data.receipts[0]?.covered.has(f.peer), true);
});

await test('failure to persist a confirmed account checkpoint cannot publish its new selected-window content', async () => {
  const f = resumeFixture(true);
  await f.add('Already verified');
  await f.controller.synchronize();
  await f.add('Not durably committed');
  f.data.beforeLocalWrite = (name) => {
    if (name.startsWith('sync-progress:'))
      throw new Error('Synthetic storage failure');
  };
  await assert.rejects(
    f.controller.synchronizeAll(new AbortController().signal),
    /Synthetic storage failure/u,
  );
  assert.deepEqual(
    f.data.frames.at(-1)?.map((row) => row.text),
    ['Already verified'],
  );
  assert.equal(f.data.receipts.length, 0);
  assert.ok(!f.data.records.has(`sync-progress:v2:${f.session.deviceId}`));
});

await test('scrolling up adds one verified page under the shown window, which stays visible and keeps that depth on later updates', async () => {
  const { controller, data, add } = resumeFixture();
  const synchronize = async () => {
    let next = await controller.synchronize();
    while (next) next = await next.resume();
  };
  const texts = () =>
    (data.frames.at(-1) ?? [])
      .filter((row) => row.kind !== 'profile' && !row.relation)
      .map((row) => row.text);
  for (let index = 0; index < 20; index++) await add(`Message ${index}`);
  await synchronize();
  assert.equal(texts().length, 16);
  assert.equal(texts()[0], 'Message 4');
  assert.equal(controller.olderAvailable(texts().length), true);
  const shown = data.frames.length;
  controller.requestOlder();
  await synchronize();
  assert.ok(data.frames.slice(shown).every((frame) => frame !== null));
  assert.deepEqual(
    texts(),
    Array.from({ length: 20 }, (_, index) => `Message ${index}`),
  );
  data.snapshot.revision++;
  await add('Message 20');
  controller.hint();
  if (await controller.probe()) await synchronize();
  assert.equal(texts().length, 21);
  assert.equal(texts()[0], 'Message 0');
  controller.requestOlder();
  await synchronize();
  assert.equal(texts().length, 21);
  assert.equal(controller.olderAvailable(texts().length), false);
});

await test('history expands after background receipt fills a conversation that initially opened empty', async () => {
  const { controller, data, add } = resumeFixture(true);
  controller.setLiveConnected(true);
  await controller.synchronize();
  for (let index = 0; index < 20; index++) await add(`Received ${index}`);
  const signal = new AbortController().signal;
  for (let turn = 0; turn < 4; turn++)
    if (!(await controller.synchronizeAll(signal))) break;
  const texts = () =>
    (data.frames.at(-1) ?? [])
      .filter((row) => row.kind !== 'profile' && !row.relation)
      .map((row) => row.text);
  assert.equal(texts().length, 16);
  controller.requestOlder();
  let continuation = await controller.synchronize();
  while (continuation) continuation = await continuation.resume();
  assert.deepEqual(
    texts(),
    Array.from({ length: 20 }, (_, index) => `Received ${index}`),
  );
});
