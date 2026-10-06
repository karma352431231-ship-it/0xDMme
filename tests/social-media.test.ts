import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initAsync } from '@matrix-org/matrix-sdk-crypto-wasm';
import { prepareGif } from '../src/shared/gif-inspection/index.ts';
import {
  socialAttachment,
  checkSocialBytes,
} from '../src/shared/social-media/index.ts';
import { sealFile, openFile } from '../src/client/attachment-crypto/index.ts';
import {
  BackupReader,
  BackupWriter,
} from '../src/client/backup-archive/index.ts';
import { encode } from '../src/shared/account/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';
import type { BackupRecord } from '../src/client/backup-records/index.ts';
import { SocialBackups } from '../src/client/social-backups/index.ts';
import { SocialDms } from '../src/client/social-dm/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type { VaultAccess } from '../src/client/vault-authority/index.ts';

function join(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}
function gif(comment = false): Uint8Array<ArrayBuffer> {
  const single = Uint8Array.from(
    Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAkQBADs=', 'base64'),
  );
  const loop = join(
    new Uint8Array([33, 255, 11]),
    new TextEncoder().encode('NETSCAPE2.0'),
    new Uint8Array([3, 1, 0, 0, 0]),
  );
  const control = new Uint8Array([33, 249, 4, 4, 5, 0, 0, 0]),
    frame = single.subarray(19, -1);
  const meta = comment
    ? join(
        new Uint8Array([33, 254, 9]),
        new TextEncoder().encode('synthetic'),
        new Uint8Array([0]),
      )
    : new Uint8Array();
  return join(
    single.subarray(0, 19),
    loop,
    meta,
    control,
    frame,
    control,
    frame,
    new Uint8Array([59]),
  );
}
await test('GIF conserva dois quadros, delays e loop; remove comentários e recusa truncamento/pixels excessivos', () => {
  assert.deepEqual(prepareGif(gif(true)), gif());
  assert.throws(() => prepareGif(gif().subarray(0, -1)));
  const huge = gif();
  huge[6] = 255;
  huge[7] = 255;
  assert.throws(() => prepareGif(huge));
});
await test('backup de DM/GIF usa SDK real, reabre separado do chat por wallet e exige mídia completa para limpar', async () => {
  await initAsync();
  const owner = await groupParticipant(),
    sealed = await sealFile(gif());
  const content = socialAttachment(
    {
      version: 1,
      name: 'teste.gif',
      type: 'image/gif',
      caption: '',
      image: true,
      file: sealed.file,
      thumbnail: null,
    },
    'gif',
  );
  checkSocialBytes(content, 'gif', gif());
  assert.throws(() => checkSocialBytes(content, 'gif', gif(true)));
  const row: BackupRecord = {
    type: 'dm-message',
    id: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    self: crypto.randomUUID(),
    peer: { id: crypto.randomUUID(), handle: 'dm_teste', avatar: null },
    sequence: 1,
    own: true,
    kind: 'attachment',
    media: 'gif',
    text: JSON.stringify(content),
  };
  const writer = await BackupWriter.create(owner.authority);
  await writer.add(row, () => {});
  await writer.add(
    {
      type: 'dm-media',
      id: sealed.file.ref.id,
      hash: sealed.file.ref.hash,
      self: row.self,
      message: row.id,
      thumbnail: false,
      bytes: encode(sealed.bytes),
    },
    () => {},
  );
  const identity = JSON.stringify({
    ciphertext: 'cápsula sintética já cifrada',
  });
  await writer.add(
    {
      type: 'dm-identity',
      id: row.self,
      hash: await (
        await import('../src/shared/vault/index.ts')
      ).bytesHash(new TextEncoder().encode(identity)),
      value: identity,
    },
    () => {},
  );
  const file = await writer.finish([], () => {}),
    reader = await BackupReader.open(owner.authority, file, () => {});
  assert.equal(reader.complete, true);
  assert.deepEqual(reader.targets, [
    { kind: 'dm-message', id: row.id, hash: row.hash },
  ]);
  assert.deepEqual(await reader.read(0), row);
  const media = await reader.read(1);
  assert.equal(media.type, 'dm-media');
  if (media.type !== 'dm-media') throw new Error('Mídia ausente.');
  assert.deepEqual(
    await openFile(
      content.file,
      Uint8Array.from(Buffer.from(media.bytes, 'base64')),
    ),
    gif(),
  );
  assert.equal((await reader.read(2)).type, 'dm-identity');
  reader.close();
  const incomplete = await BackupWriter.create(owner.authority);
  await incomplete.add(row, () => {});
  const missing = await BackupReader.open(
    owner.authority,
    await incomplete.finish([], () => {}),
    () => {},
  );
  assert.equal(missing.complete, false);
  assert.equal(missing.targets.length, 0);
  missing.close();
  assert.throws(() =>
    socialAttachment({ ...content, type: 'video/mp4', image: false }, 'gif'),
  );
  assert.throws(() =>
    socialAttachment({ ...content, type: 'image/png' }, 'gif'),
  );
});

await test('exportação reúne cópias de DM uma vez, preserva mídia e recusa hashes divergentes', async (t) => {
  const owner = await groupParticipant(),
    sealed = await sealFile(gif());
  const row: Extract<BackupRecord, { type: 'dm-message' }> = {
    type: 'dm-message',
    id: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    self: crypto.randomUUID(),
    peer: { id: crypto.randomUUID(), handle: 'dm_teste', avatar: null },
    sequence: 1,
    own: true,
    kind: 'attachment',
    media: 'gif',
    text: JSON.stringify({
      version: 1,
      name: 'teste.gif',
      type: 'image/gif',
      caption: '',
      image: true,
      file: sealed.file,
      thumbnail: null,
    }),
  };
  const access: VaultAccess = {
    withVault: (_offline, work) => work(owner.authority),
    withLocalVault: (_locator, work) => work(owner.authority),
  };
  t.mock.method(SocialDms.prototype, 'request', () =>
    Promise.resolve({ profile: row.self, anchor: 1 }),
  );
  t.mock.method(SocialDms.prototype, 'identityRecord', () =>
    Promise.resolve(null),
  );
  t.mock.method(
    SocialDms.prototype,
    'historyPage',
    (_snapshot: unknown, after: number) =>
      Promise.resolve({
        items: after === 0 ? [row, row] : [],
        unavailable: [],
        next: after === 0 ? 1 : null,
      }),
  );
  const download = t.mock.method(SocialDms.prototype, 'media', () =>
    Promise.resolve(Uint8Array.from(sealed.bytes)),
  );
  const writer = await BackupWriter.create(owner.authority);
  await writer.add(row, () => {});
  const exporter = new SocialBackups(access, new VaultSync(access)),
    known = new Map([[`dm-message:${row.id}`, row.hash]]),
    exported = new Map<string, string>();
  const included = await exporter.export({
    append: (record) => writer.add(record, () => {}),
    known,
    exported,
    omitted: [],
    guard: () => {},
  });
  assert.equal(included, 1);
  assert.equal(download.mock.callCount(), 1);
  assert.equal(known.size, 1);
  assert.equal(exported.get(`dm-message:${row.id}`), row.hash);
  const reader = await BackupReader.open(
    owner.authority,
    await writer.finish([], () => {}),
    () => {},
  );
  assert.equal(reader.complete, true);
  assert.deepEqual(
    reader.report.records.map((record) => record.type),
    ['dm-message', 'dm-media'],
  );
  reader.close();
  await assert.rejects(
    exporter.export({
      append: () => Promise.resolve(),
      known: new Map([[`dm-media:${sealed.file.ref.id}`, 'b'.repeat(64)]]),
      exported,
      omitted: [],
      guard: () => {},
    }),
    /diverge/,
  );
  assert.equal(download.mock.callCount(), 1);
});
