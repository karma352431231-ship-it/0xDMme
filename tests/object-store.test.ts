import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtemp,
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
    Array.from({ length: 8 }, () => store.put(bytes)),
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
  const pending = join(
    directory,
    '.staging',
    'pending-00000000-0000-0000-0000-000000000000',
  );
  await writeFile(pending, 'synthetic-interrupted-upload');
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await utimes(pending, old, old);
  await utimes(join(directory, id), old, old);
  await new ObjectStore(directory).initialize();
  assert.deepEqual(await readdir(join(directory, '.staging')), []);
  assert.deepEqual(Array.from(await store.read(id)), [33, 45]);
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
