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
  controller.pending = () =>
    Promise.resolve([{ id: crypto.randomUUID(), peer }]);
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
  const rejected = assert.rejects(loading, /superseded|replaced/);
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
  const { controller, data, add, peer } = resumeFixture();
  const other = crypto.randomUUID();
  await add('Primeira conversa');
  await add('Segunda conversa', other);
  controller.select(null);
  assert.equal(
    await controller.synchronizeAll(new AbortController().signal),
    false,
  );
  assert.equal(data.frames.at(-1), null);
  assert.equal(data.cacheReads.length, 2);
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
  const { controller, data, add, peer } = resumeFixture();
  for (let index = 0; index < 144; index++) await add(`Fictícia ${index}`);
  await assert.rejects(controller.synchronize(), /partially verified/);
  assert.equal(data.frames.at(-1), null);
  assert.equal(data.requests.filter((op) => op === 'page').length, 8);
  controller.pause();
  controller.select(peer);
  await controller.synchronize();
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
  assert.deepEqual(data.cacheReads.slice(reads), [`cache:${edit.id}`]);
  assert.equal(data.frames.at(-1)?.length, 3);
  controller.select(other);
  const navigation = data.requests.length;
  assert.equal(await controller.probe(), false);
  assert.deepEqual(data.requests.slice(navigation), ['delivery']);
  assert.equal(data.frames.at(-1)?.[0]?.text, 'Outra conversa');
});

await test('complete preparation queries only changes without rereading intact messages', async () => {
  const { controller, data, add } = resumeFixture();
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
  assert.deepEqual(data.cacheReads.slice(reads), [`cache:${added.id}`]);
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
    f.controller.pending = () =>
      Promise.resolve([{ id: crypto.randomUUID(), peer: f.peer }]);
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
