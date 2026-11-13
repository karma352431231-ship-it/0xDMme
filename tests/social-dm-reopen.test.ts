import assert from 'node:assert/strict';
import { test } from 'node:test';
import { socialReopenFixture } from './fixtures/social-dm-reopen.ts';

await test('public-handle cold reopen confirms its complete encrypted page without reopening unchanged history records', async () => {
  const f = await socialReopenFixture();
  const initial = await f.create().read(f.peer.id, null);
  assert.equal(initial.items[0]?.text, 'Synthetic public conversation');
  assert.equal(f.data.historyReads, 1);
  f.data.requests.length = 0;
  const resumed = await f.create().read(f.peer.id, null);
  assert.equal(resumed.items[0]?.text, initial.items[0]?.text);
  assert.equal(f.data.historyReads, 1);
  assert.equal(f.data.requests.includes('dm-personal-page'), false);
  assert.ok(f.data.requests.includes('dm-message-status'));
});
await test('public profile changes cannot reuse another profile page, and current access denial still fails', async () => {
  const f = await socialReopenFixture();
  await f.create().read(f.peer.id, null);
  f.snapshot.profile = crypto.randomUUID();
  f.data.records = f.data.records.map((row) => ({
    ...row,
    self: f.snapshot.profile,
    text: 'Synthetic new public identity',
  }));
  await f.seedCursor();
  const next = await f.create().read(f.peer.id, null);
  assert.equal(next.items[0]?.text, 'Synthetic new public identity');
  assert.equal(f.data.historyReads, 2);
  f.data.denied = true;
  await assert.rejects(f.create().read(f.peer.id, null), /Access denied/);
});
await test('public media previews use current profile and peer authorization for both sender and recipient without reading originals', async () => {
  for (const own of [false, true]) {
    const f = await socialReopenFixture();
    const row = {
      ...f.data.records[0]!,
      own,
      kind: 'attachment' as const,
      media: 'photo' as const,
      text: JSON.stringify({
        version: 1,
        name: 'synthetic.png',
        type: 'image/png',
        image: true,
        caption: '',
        thumbnail: null,
        file: {
          ref: {
            id: crypto.randomUUID(),
            bytes: 57,
            hash: 'a'.repeat(64),
            parts: [{ bytes: 57, hash: 'a'.repeat(64) }],
          },
          encryption: '{}',
        },
      }),
    };
    const bytes = Uint8Array.of(255, 216, 255, 33, 255, 217);
    f.data.records = [row];
    const sender = f.create();
    await sender.read(f.peer.id, null);
    await sender.mediaPreviews(row).save(bytes);
    const receiver = f.create();
    await receiver.read(f.peer.id, null);
    f.data.requests.length = 0;
    assert.deepEqual(
      Array.from((await receiver.mediaPreviews(row).read())!),
      Array.from(bytes),
    );
    assert.equal(f.data.requests.includes('dm-attachment-get'), false);
    assert.ok(f.data.requests.includes('dm-message-status'));
    const beforeDeletion = receiver.mediaPreviews(row);
    f.snapshot.removals++;
    await assert.rejects(beforeDeletion.read(), /DM history changed/);
    f.snapshot.removals--;
    f.data.denied = true;
    await assert.rejects(receiver.mediaPreviews(row).read(), /Access denied/);
  }
});
