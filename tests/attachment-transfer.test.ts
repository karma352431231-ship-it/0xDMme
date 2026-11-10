import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { sealFile } from '../src/client/attachment-crypto/index.ts';
import {
  uploadAttachments,
  downloadSealedAttachment,
} from '../src/client/attachments/index.ts';
import type { AttachmentApi } from '../src/client/attachments/index.ts';
import { localPut } from '../src/client/message-storage/index.ts';
import { AccountError, base64 } from '../src/shared/account/index.ts';
import {
  attachmentContent,
  partLimit,
  verifyAttachmentPart,
} from '../src/shared/attachments/index.ts';
import { recordDatabase } from './fixtures/record-database.ts';

async function fixture(t: TestContext) {
  const database = recordDatabase();
  const previous = ['indexedDB', 'IDBKeyRange', 'window'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const [key, value] of Object.entries({
    indexedDB: database.factory,
    IDBKeyRange: database.range,
    window: new EventTarget(),
  }))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const sealed = await sealFile(new Uint8Array(partLimit * 2 + 37).fill(71));
  const account = crypto.randomUUID(),
    message = crypto.randomUUID();
  for (let index = 0; index < sealed.file.ref.parts.length; index++) {
    const bytes = sealed.bytes.slice(
      index * partLimit,
      (index + 1) * partLimit,
    );
    await localPut(
      account,
      `attachment:${message}:${sealed.file.ref.id}:${index}`,
      bytes,
      bytes.length + 128,
    );
  }
  const content = attachmentContent({
    version: 1,
    name: 'synthetic.bin',
    type: 'application/octet-stream',
    caption: '',
    image: false,
    file: sealed.file,
    thumbnail: null,
  });
  return { account, message, peer: crypto.randomUUID(), content, sealed };
}

/** Model only the remote single-writer lease and lost response boundary.
 * The client, ciphertext, hash verification and local persistence stay real. */
function server(file: Awaited<ReturnType<typeof fixture>>['sealed']) {
  const received = new Map<number, Uint8Array>();
  let writing = false,
    finished = 0,
    loseResponseAt: number | null = null;
  const lost = new Error('Synthetic lost part response.');
  const api: AttachmentApi = async (operation, data) => {
    if (operation === 'attachment-reserve')
      return [
        { id: file.file.ref.id, ready: false, received: [...received.keys()] },
      ];
    if (operation === 'attachment-finish') {
      assert.equal(writing, false);
      assert.equal(
        received.size,
        file.file.ref.parts.length,
        'Incomplete uploads cannot finish.',
      );
      finished++;
      return { status: 'ready' };
    }
    assert.equal(operation, 'attachment-part');
    if (writing) throw new AccountError(409, 'Attachment busy.');
    const index = Number(data['index']);
    const bytes = Uint8Array.from(base64(data['ciphertext'], partLimit));
    writing = true;
    try {
      await verifyAttachmentPart(file.file.ref, index, bytes);
      await delay(25);
      received.set(index, bytes);
      if (loseResponseAt === index) {
        loseResponseAt = null;
        throw lost;
      }
      return { status: 'stored' };
    } finally {
      writing = false;
    }
  };
  return {
    api,
    received,
    lost,
    finished: () => finished,
    loseResponse: (index: number) => {
      loseResponseAt = index;
    },
  };
}

await test('normal uploads respect the server single-writer lease instead of failing with HTTP 409', async (t) => {
  const f = await fixture(t),
    remote = server(f.sealed);
  await assert.doesNotReject(uploadAttachments({ ...f, api: remote.api }));
  assert.equal(remote.finished(), 1);
  const received = Buffer.concat([...remote.received.values()]);
  assert.deepEqual(new Uint8Array(received), f.sealed.bytes);
});

await test('a lost part response stops upload; retry skips preserved ciphertext before completing', async (t) => {
  const f = await fixture(t),
    remote = server(f.sealed);
  const original = JSON.stringify(f.content);
  remote.loseResponse(1);
  await assert.rejects(
    uploadAttachments({ ...f, api: remote.api }),
    (error: unknown) => error === remote.lost,
  );
  assert.equal(remote.finished(), 0);
  assert.deepEqual([...remote.received.keys()], [0, 1]);
  const saved = remote.received.get(1);
  await uploadAttachments({ ...f, api: remote.api });
  assert.equal(
    remote.received.get(1),
    saved,
    'Retry must skip the remotely preserved part.',
  );
  assert.equal(remote.finished(), 1);
  assert.equal(JSON.stringify(f.content), original);
  assert.deepEqual(
    new Uint8Array(Buffer.concat([...remote.received.values()])),
    f.sealed.bytes,
  );
});

await test('encrypted downloads retain bounded concurrency and assemble parts at their original offsets', async (t) => {
  const f = await fixture(t);
  let active = 0,
    peak = 0;
  const bytes = await downloadSealedAttachment({
    account: crypto.randomUUID(),
    message: f.message,
    file: f.sealed.file,
    thumbnail: false,
    image: false,
    snapshot: undefined,
    guard: () => {},
    api: async (operation, data) => {
      assert.equal(operation, 'attachment-get');
      const index = Number(data['index']);
      peak = Math.max(peak, ++active);
      try {
        await delay(index === 0 ? 25 : 1);
        return {
          ciphertext: Buffer.from(
            f.sealed.bytes.subarray(index * partLimit, (index + 1) * partLimit),
          ).toString('base64'),
        };
      } finally {
        active--;
      }
    },
  });
  assert.equal(peak, 2);
  assert.deepEqual(bytes, f.sealed.bytes);
});
