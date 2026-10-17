import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtemp,
  open,
  rm,
  symlink,
  writeFile,
  readdir,
  realpath,
  utimes,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ObjectStore } from '../src/server/object-store/index.ts';

await test('objetos sobrevivem a nova instância; concorrência é idempotente e corrupção falha', async (t) => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'hash-talk-objects-')),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = resolve(directory, 'objects');
  const store = new ObjectStore(path);
  await store.initialize();
  const bytes = new Uint8Array([91, 17, 255, 33]);
  const identities = await Promise.all(
    Array.from({ length: 40 }, () => store.put(bytes)),
  );
  assert.equal(new Set(identities).size, 1);
  const identity = identities[0];
  assert.ok(identity);
  const reopened = new ObjectStore(path);
  await reopened.initialize();
  assert.deepEqual(
    Array.from(await reopened.read(identity)),
    Array.from(bytes),
  );
  assert.deepEqual((await readdir(path)).sort(), ['.staging', identity]);
  assert.deepEqual(await readdir(join(path, '.staging')), []);
  await assert.rejects(store.read('../private'));
  await assert.rejects(store.put(new Uint8Array()));
  await assert.rejects(store.put(new Uint8Array(4 * 1024 * 1024)));
  await writeFile(join(path, identity), 'corrupt');
  await assert.rejects(store.read(identity), /Integridade/);
  await assert.rejects(store.put(bytes), /Integridade/);
});

await test('limpeza expira somente temporários não aceitos, preservando objetos finais antigos', async (t) => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'hash-talk-object-cleanup-')),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ObjectStore(directory);
  await store.initialize();
  const id = await store.put(new Uint8Array([33, 45]));
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
  for (let index = 0; index < 65; index++) {
    const pending = join(
      directory,
      '.staging',
      `pending-${crypto.randomUUID()}`,
    );
    await writeFile(pending, 'synthetic-interrupted-upload');
    await utimes(pending, old, old);
  }
  const fresh = `pending-${crypto.randomUUID()}`;
  await writeFile(join(directory, '.staging', fresh), 'recent');
  await utimes(join(directory, id), old, old);
  await new ObjectStore(directory).initialize();
  assert.deepEqual(await readdir(join(directory, '.staging')), [fresh]);
  assert.deepEqual(Array.from(await store.read(id)), [33, 45]);
});

await test('object writes reject memory pressure and release the budget after a filesystem failure', async (t) => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'hash-talk-object-pressure-')),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  let available = 0;
  t.mock.method(process, 'availableMemory', () => available);
  const store = new ObjectStore(directory);
  await store.initialize();
  const bytes = new Uint8Array([1, 2, 3]);
  await assert.rejects(store.put(bytes), /Armazenamento ocupado/u);
  available = 65_536 + bytes.length * 2;
  const id = await store.put(bytes);
  await writeFile(join(directory, id), 'corrupt');
  await assert.rejects(store.put(bytes));
  const recovered = await store.put(new Uint8Array([4, 5, 6]));
  assert.deepEqual([...(await store.read(recovered))], [4, 5, 6]);
  assert.deepEqual(await readdir(join(directory, '.staging')), []);
});

await test('objeto e diretório com symlink não atravessam fronteira de armazenamento', async (t) => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'hash-talk-object-links-')),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ObjectStore(resolve(directory, 'objects'));
  await store.initialize();
  const privateFile = join(directory, 'private');
  await writeFile(privateFile, 'synthetic-private-data');
  const id = 'a'.repeat(64);
  await symlink(privateFile, join(directory, 'objects', id));
  await assert.rejects(store.read(id));
  await symlink(join(directory, 'objects'), join(directory, 'linked'));
  await assert.rejects(
    new ObjectStore(resolve(directory, 'linked')).initialize(),
  );
});

await test('retomada sob lease remove temporário recente de anexo sem apagar partes duráveis ou outro namespace', async (t) => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'hash-talk-attachment-resume-')),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ObjectStore(directory);
  await store.initialize();
  const id = crypto.randomUUID(),
    otherId = crypto.randomUUID(),
    first = await store.attachment(id),
    second = await store.attachment(otherId),
    hash = await first.put(new Uint8Array([1, 2, 3])),
    otherHash = await second.put(new Uint8Array([4, 5, 6]));
  await writeFile(
    join(
      directory,
      `attachment-${id}`,
      '.staging',
      `pending-${crypto.randomUUID()}`,
    ),
    'synthetic-recent-interrupted-write',
  );
  for (let index = 0; index < 40; index++)
    await writeFile(
      join(
        directory,
        `attachment-${id}`,
        '.staging',
        `pending-${crypto.randomUUID()}`,
      ),
      'recent',
    );
  const resumed = await store.attachment(id);
  assert.deepEqual(
    await readdir(join(directory, `attachment-${id}`, '.staging')),
    [],
  );
  assert.deepEqual([...(await resumed.read(hash))], [1, 2, 3]);
  await store.discardAttachment(id);
  assert.deepEqual(
    [...(await (await store.readAttachment(otherId)).read(otherHash))],
    [4, 5, 6],
  );
});

await test('an absent attachment still requires durable directory sync before collection can release bytes', async (t) => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'hash-talk-attachment-sync-')),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ObjectStore(directory);
  await store.initialize();
  const handle = await open(directory, 'r'),
    prototype = Object.getPrototypeOf(handle) as { sync(): Promise<void> };
  await handle.close();
  const sync = t.mock.method(prototype, 'sync', () =>
    Promise.reject(new Error('synthetic directory sync failure')),
  );
  await assert.rejects(
    store.discardAttachment(crypto.randomUUID()),
    /synthetic directory sync failure/u,
  );
  assert.equal(sync.mock.callCount(), 1);
  sync.mock.restore();
  await store.discardAttachment(crypto.randomUUID());
});

await test('independent attachment collectors tolerate durable concurrent removal without touching another namespace', async (t) => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), '0xdmme-collect-race-')),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = new ObjectStore(directory),
    second = new ObjectStore(directory);
  await first.initialize();
  const kept = crypto.randomUUID(),
    other = await first.attachment(kept);
  const keptHash = await other.put(new Uint8Array([9, 8, 7]));
  for (let trial = 0; trial < 3; trial++) {
    const id = crypto.randomUUID(),
      files = await first.attachment(id);
    for (let index = 0; index < 40; index++)
      await files.put(new Uint8Array([trial, index, 4]));
    const outcomes = await Promise.allSettled([
      first.discardAttachment(id),
      second.discardAttachment(id),
    ]);
    assert.deepEqual(
      outcomes.map((result) => result.status),
      ['fulfilled', 'fulfilled'],
    );
    assert.equal(
      (await readdir(directory)).includes(`attachment-${id}`),
      false,
    );
  }
  assert.deepEqual([...(await other.read(keptHash))], [9, 8, 7]);
});

await test('attachment reclamation rejects irregular entries and never follows their symlinks', async (t) => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), '0xdmme-collect-links-')),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ObjectStore(directory);
  await store.initialize();
  const id = crypto.randomUUID();
  await store.attachment(id);
  const outside = join(directory, 'retained');
  await writeFile(outside, 'retained synthetic bytes');
  await symlink(outside, join(directory, `attachment-${id}`, 'a'.repeat(64)));
  await assert.rejects(store.discardAttachment(id), /irregular/u);
  const file = await open(outside, 'r');
  try {
    assert.equal(await file.readFile('utf8'), 'retained synthetic bytes');
  } finally {
    await file.close();
  }
});
