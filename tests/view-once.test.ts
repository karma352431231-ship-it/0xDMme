import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupParticipant } from './fixtures/group-participant.ts';
import { createRecoveryKey } from '../src/client/message-recovery/index.ts';
import {
  prepareViewOnce,
  viewOnceDescriptor,
  decryptViewOnce,
  makeViewOnceContents,
  sealViewOnceDraft,
  openViewOnceDraft,
  uploadViewOnce,
} from '../src/client/view-once/index.ts';
import {
  viewOnceContent,
  viewOnceHeader,
  viewOnceHeaderBody,
} from '../src/shared/view-once/index.ts';
import { decodeDailyText, encodeDailyText } from '../src/shared/daily/index.ts';
import { digest } from '../src/shared/devices/index.ts';
import { encode, object } from '../src/shared/account/index.ts';
import type { ViewOnceContent } from '../src/shared/view-once/index.ts';

await test('single-use content stays outside history and cannot be decrypted with another audience, scope, policy, hash or file metadata', async () => {
  const sender = await groupParticipant(),
    receiver = await groupParticipant();
  const recovery = await createRecoveryKey(receiver.authority);
  for (const content of [
    { text: 'Secret text 🔐' },
    {
      text: 'Secret caption',
      file: {
        name: 'photo.png',
        mime: 'image/png',
        data: encode(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])),
      },
    },
    {
      text: '',
      file: {
        name: 'report.pdf',
        mime: 'application/pdf',
        data: encode(new TextEncoder().encode('%PDF synthetic')),
      },
    },
  ] satisfies ViewOnceContent[]) {
    const id = crypto.randomUUID();
    const prepared = await prepareViewOnce({
      id,
      scope: 'private',
      sender: sender.accountId,
      recipient: recovery,
      content,
    });
    const descriptor = await viewOnceDescriptor(prepared, content);
    const daily = decodeDailyText(descriptor.text);
    assert.equal(daily.text, '');
    assert.ok(daily.viewOnce);
    assert.equal(daily.viewOnce.hash, descriptor.reference.hash);
    assert.equal(JSON.stringify(prepared.header).includes('Secret'), false);
    const input = {
      id,
      scope: 'private' as const,
      peer: sender.accountId,
      authority: receiver.authority,
      recovery,
      metadata: daily.viewOnce,
      response: { header: prepared.header, bytes: encode(prepared.bytes) },
    };
    assert.deepEqual(await decryptViewOnce(input), content);
    await assert.rejects(decryptViewOnce({ ...input, scope: 'public' }));
    await assert.rejects(
      decryptViewOnce({ ...input, peer: crypto.randomUUID() }),
    );
    await assert.rejects(
      decryptViewOnce({
        ...input,
        metadata: { ...input.metadata, hash: 'a'.repeat(64) },
      }),
    );
    await assert.rejects(
      decryptViewOnce({
        ...input,
        metadata: {
          ...input.metadata,
          policy: input.metadata.policy === 'file' ? 'mobile' : 'file',
        },
      }),
    );
    if (daily.viewOnce.file)
      await assert.rejects(
        decryptViewOnce({
          ...input,
          metadata: {
            ...daily.viewOnce,
            file: { ...daily.viewOnce.file, bytes: 1 },
          },
        }),
      );
    const corrupt = Uint8Array.from(prepared.bytes);
    corrupt[0] = corrupt[0]! ^ 1;
    await assert.rejects(
      decryptViewOnce({
        ...input,
        response: { ...input.response, bytes: encode(corrupt) },
      }),
    );
    assert.throws(() =>
      encodeDailyText({
        ...daily,
        text: 'Cannot leak this through normal history',
      }),
    );
    assert.throws(() => encodeDailyText({ ...daily, forwarded: true }));
    assert.throws(() => viewOnceHeader({ ...prepared.header, extra: 'value' }));
    assert.notEqual(
      await digest(viewOnceHeaderBody({ ...prepared.header, scope: 'public' })),
      descriptor.reference.hash,
    );
  }
});

await test('download-only files split accompanying text into a protected message, while image captions remain protected together', async () => {
  const bytes = new TextEncoder().encode('synthetic file');
  const selection = {
    name: 'report.txt',
    type: 'text/plain',
    image: false,
    bytes,
    thumbnail: null,
  };
  const contents = makeViewOnceContents(
    'Secret caption',
    selection,
    10_000_000,
  );
  assert.equal(contents.length, 2);
  assert.deepEqual(contents[0], { text: 'Secret caption' });
  assert.equal(contents[1]?.text, '');
  assert.equal(contents[1]?.file?.name, 'report.txt');
  assert.throws(() =>
    makeViewOnceContents('', { ...selection, bytes: new Uint8Array(12) }, 10),
  );
  assert.throws(() =>
    viewOnceContent({
      text: '',
      file: { name: 'bad\nname', mime: 'text/plain', data: encode(bytes) },
    }),
  );
  const image = makeViewOnceContents(
    'Caption',
    { ...selection, type: 'image/png' },
    10_000_000,
  );
  assert.equal(image.length, 1);
  assert.equal(image[0]?.text, 'Caption');
  const owner = await groupParticipant();
  const long = {
    text: '🔐'.repeat(3990),
    file: {
      name: 'large.bin',
      mime: 'application/octet-stream',
      data: encode(new Uint8Array(150_000).fill(42)),
    },
  };
  const chunks = await sealViewOnceDraft(owner.authority, long);
  assert.ok(chunks.length > 1);
  assert.equal(JSON.stringify(chunks).includes('large.bin'), false);
  assert.deepEqual(await openViewOnceDraft(owner.authority, chunks), long);
  await assert.rejects(openViewOnceDraft(owner.authority, chunks.slice(1)));
});

await test('resumed uploads keep stable ciphertext and accept only exact bounded progress', async () => {
  const receiver = await groupParticipant();
  const recovery = await createRecoveryKey(receiver.authority);
  const prepared = await prepareViewOnce({
    id: crypto.randomUUID(),
    scope: 'public',
    sender: crypto.randomUUID(),
    recipient: recovery,
    content: {
      text: '',
      file: {
        name: 'data.zip',
        mime: 'application/zip',
        data: encode(new Uint8Array(400_000).fill(9)),
      },
    },
  });
  let offset = 111,
    chunks = 0;
  await uploadViewOnce(prepared, async (operation, data) => {
    if (operation === 'view-once-create') return { offset };
    assert.equal(operation, 'view-once-part');
    assert.equal(data['offset'], offset);
    assert.equal(
      data['hash'],
      await digest(viewOnceHeaderBody(prepared.header)),
    );
    const size = Buffer.from(String(data['bytes']), 'base64').length;
    assert.ok(size <= 192 * 1024);
    offset += size;
    chunks++;
    return { offset };
  });
  assert.equal(offset, prepared.bytes.length);
  assert.ok(chunks > 1);
  await assert.rejects(
    uploadViewOnce(prepared, () => Promise.resolve({ offset: -1 })),
  );
  await assert.rejects(
    uploadViewOnce(prepared, (operation) =>
      Promise.resolve(
        operation === 'view-once-create'
          ? { offset: 0 }
          : object({ offset: 1 }),
      ),
    ),
  );
});
