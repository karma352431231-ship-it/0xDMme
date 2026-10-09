import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Attachment } from '@matrix-org/matrix-sdk-crypto-wasm';
import { checkSocialBytes } from '../src/shared/social-media/index.ts';
import { openFile, sealFile } from '../src/client/attachment-crypto/index.ts';
import {
  attachmentContent,
  attachmentRef,
  attachmentRefs,
  fileLimit,
  safeFilename,
} from '../src/shared/attachments/index.ts';
import {
  assertFileAllowed,
  imageShape,
  metadataFree,
  stripEncodedMetadata,
  prepareOriginal,
} from '../src/client/attachment-images/index.ts';
await test('anexo de 3 MB usa SDK real, mantém tamanho verificável e rejeita adulteração e segredo errado', async () => {
  const bytes = new Uint8Array(fileLimit).fill(71),
    sealed = await sealFile(bytes);
  assert.equal(sealed.bytes.length, bytes.length);
  assert.equal(sealed.file.ref.parts.length, 12);
  assert.equal(attachmentRef(sealed.file.ref).bytes, fileLimit);
  assert.deepEqual(await openFile(sealed.file, sealed.bytes), bytes);
  const corrupt = sealed.bytes.slice();
  corrupt[0] = 8;
  await assert.rejects(openFile(sealed.file, corrupt));
  await assert.rejects(openFile(sealed.file, sealed.bytes.subarray(1)));
  const wrong = await sealFile(new Uint8Array([1, 2, 3]));
  await assert.rejects(
    openFile(
      { ...sealed.file, encryption: wrong.file.encryption },
      sealed.bytes,
    ),
  );
  await assert.rejects(sealFile(new Uint8Array(fileLimit + 1)));
  await assert.rejects(sealFile(new Uint8Array()));
  assert.throws(() =>
    attachmentRef({ ...sealed.file.ref, bytes: fileLimit + 1 }),
  );
  assert.throws(() =>
    attachmentRef({
      ...sealed.file.ref,
      parts: sealed.file.ref.parts.slice(1),
    }),
  );
});
await test('cifras independentes não deduplicam arquivos legíveis; contrato privado não permite refs extras ou miniatura grande', async () => {
  const bytes = new Uint8Array([4, 5, 6]),
    one = await sealFile(bytes),
    two = await sealFile(bytes);
  assert.notEqual(one.file.ref.hash, two.file.ref.hash);
  const card = {
    version: 1,
    name: '../../foto\u202ehtml',
    type: 'application/octet-stream',
    caption: '',
    image: false,
    file: one.file,
    thumbnail: null,
  };
  assert.equal(attachmentContent(card).caption, '');
  assert.ok(!safeFilename(card.name).includes('/'));
  assert.throws(() => attachmentRefs([one.file.ref, one.file.ref]));
  assert.throws(() => attachmentContent({ ...card, image: true }));
  assert.throws(() => attachmentContent({ ...card, thumbnail: two.file }));
  const large = await sealFile(new Uint8Array(96_001));
  assert.throws(() => attachmentRefs([one.file.ref, large.file.ref]));
  // Also prove the SDK export is the maintained attachment path, not a substitute cipher.
  const sdk = Attachment.encrypt(bytes);
  try {
    assert.ok(sdk.mediaEncryptionInfo);
  } finally {
    sdk.free();
  }
});
function png(
  width: number,
  height: number,
  chunk = 'IDAT',
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(57),
    v = new DataView(bytes.buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  v.setUint32(8, 13);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  v.setUint32(16, width);
  v.setUint32(20, height);
  bytes.set(new TextEncoder().encode(chunk), 37);
  bytes.set(new TextEncoder().encode('IEND'), 49);
  return bytes;
}
await test('imagem original conserva bytes e metadados, dispensa miniatura e reconhece 12 MP sem reencodar', async () => {
  const bytes = png(4000, 3000, 'eXIf'),
    file = new File([bytes], 'camera.png', {
      type: 'application/octet-stream',
    }),
    selected = await prepareOriginal(file);
  assert.deepEqual(selected.bytes, bytes);
  assert.equal(selected.name, 'camera.png');
  assert.equal(selected.type, 'image/png');
  assert.equal(selected.image, true);
  assert.equal(selected.thumbnail, null);
  assert.equal(metadataFree(selected.bytes, selected.type), false);
  const sealed = await sealFile(selected.bytes);
  assert.doesNotThrow(() =>
    checkSocialBytes(
      attachmentContent({
        version: 1,
        name: selected.name,
        type: selected.type,
        caption: '',
        image: true,
        file: sealed.file,
        thumbnail: null,
      }),
      'photo',
      selected.bytes,
    ),
  );
  const generic = await prepareOriginal(
    new File(['original'], 'arquivo.txt', { type: 'text/plain' }),
  );
  assert.equal(generic.image, false);
  assert.equal(new TextDecoder().decode(generic.bytes), 'original');
});
await test('original acima de 3 MB é recusado antes da leitura; teto exato e formatos sem prévia conservam os bytes', async () => {
  let reads = 0;
  const oversized = {
    size: fileLimit + 1,
    arrayBuffer: () => {
      reads++;
      return Promise.resolve(new ArrayBuffer(0));
    },
  };
  await assert.rejects(prepareOriginal(oversized as File), /limite de 3 MB/);
  assert.equal(reads, 0);
  const exact = await prepareOriginal(
    new File([new Uint8Array(fileLimit)], 'teto.bin'),
  );
  assert.equal(exact.bytes.length, fileLimit);
  const oversizedPixels = png(50000, 50000);
  const original = await prepareOriginal(
    new File([oversizedPixels], 'pixels.png', { type: 'image/png' }),
  );
  assert.equal(original.image, false);
  assert.deepEqual(original.bytes, oversizedPixels);
  await assert.rejects(
    prepareOriginal(new File([new Uint8Array([1])], 'video.mp4')),
    /vídeo/,
  );
});
await test('limite de pixels vem antes de decodificar e metadados privados impedem promessa de remoção', () => {
  assert.equal(imageShape(png(320, 200)).type, 'image/png');
  assert.throws(() => imageShape(png(50000, 50000)), /pixels/);
  assert.throws(() => imageShape(png(320, 200, 'acTL')), /animada/);
  assert.equal(metadataFree(png(320, 200), 'image/png'), true);
  for (const chunk of ['eXIf', 'tEXt', 'iTXt'])
    assert.equal(metadataFree(png(320, 200, chunk), 'image/png'), false);
  assert.throws(() =>
    imageShape(
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      ),
    ),
  );
  assert.throws(
    () =>
      assertFileAllowed(
        'clip.mp4',
        'application/octet-stream',
        new Uint8Array([1]),
      ),
    /vídeo/,
  );
  const mp4 = new Uint8Array(24);
  mp4.set(new TextEncoder().encode('ftyp'), 4);
  assert.throws(
    () => assertFileAllowed('fake.pdf', 'application/octet-stream', mp4),
    /vídeo/,
  );
  for (const brand of ['heic', 'avif', 'M4A ']) {
    mp4.set(new TextEncoder().encode(brand), 8);
    assert.doesNotThrow(() =>
      assertFileAllowed('original.bin', 'application/octet-stream', mp4),
    );
  }
  assert.doesNotThrow(() =>
    assertFileAllowed(
      'document.html',
      'text/html',
      new TextEncoder().encode('<html></html>'),
    ),
  );
});

await test('encoder que acrescenta EXIF/texto produz foto limpa sem alterar blocos da imagem', () => {
  const jpeg = new Uint8Array([
    255, 216, 255, 225, 0, 8, 69, 120, 105, 102, 0, 0, 255, 254, 0, 4, 71, 80,
    255, 218, 0, 2, 12, 34, 255, 217,
  ]);
  const clean = stripEncodedMetadata(jpeg, 'image/jpeg');
  assert.equal(metadataFree(jpeg, 'image/jpeg'), false);
  assert.equal(metadataFree(clean, 'image/jpeg'), true);
  assert.deepEqual([...clean], [255, 216, 255, 218, 0, 2, 12, 34, 255, 217]);
  const encoded = png(320, 200, 'eXIf'),
    cleaned = stripEncodedMetadata(encoded, 'image/png');
  assert.equal(metadataFree(cleaned, 'image/png'), true);
  assert.deepEqual(imageShape(cleaned), {
    type: 'image/png',
    width: 320,
    height: 200,
  });
});
