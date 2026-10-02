import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  qrLink,
  qrReceipt,
  qrMatrix,
  decodeQrFrame,
  readQrPayload,
  QrCamera,
} from '../src/client/device-qr/index.ts';
import { createIdentity } from '../src/client/device-keys/index.ts';
import { canonical } from '../src/shared/devices/index.ts';

function raster(payload: string): ImageData {
  const matrix = qrMatrix(payload);
  const width = matrix.length * 4;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const color = matrix[Math.floor(y / 4)]?.[Math.floor(x / 4)] ? 0 : 255;
      data.set([color, color, color, 255], offset);
    }
  return { width, height: width, data, colorSpace: 'srgb' };
}
await test('QR transporta pedido completo com chaves e nome UTF-8 e confirmação, sem autorizar ao ler', async () => {
  const identity = await createIdentity(
    crypto.randomUUID(),
    'Telefone São Luís',
  );
  const code = {
    version: 1 as const,
    accountId: crypto.randomUUID(),
    id: crypto.randomUUID(),
    nonce: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    device: identity.public,
  };
  const request = qrLink(code);
  assert.equal(
    readQrPayload(decodeQrFrame(raster(request))!, 'link'),
    canonical(code),
  );
  const receipt = 'abc01234'.repeat(4);
  assert.equal(
    readQrPayload(decodeQrFrame(raster(qrReceipt(receipt)))!, 'receipt'),
    receipt,
  );
  assert.throws(() => readQrPayload(request, 'receipt'));
  assert.throws(() => readQrPayload(qrReceipt(receipt), 'link'));
  assert.throws(() => readQrPayload('https://attacker.example', 'link'));
  assert.throws(() =>
    readQrPayload('0xdmme-link:1:{"recoverySecret":"private"}', 'link'),
  );
  assert.throws(() => qrReceipt('wrong'));
  assert.throws(() => readQrPayload('a'.repeat(4097), 'link'));
  assert.throws(() =>
    decodeQrFrame({
      width: 961,
      height: 1,
      data: new Uint8ClampedArray(3844),
      colorSpace: 'srgb',
    }),
  );
  const empty = raster(qrReceipt(receipt));
  empty.data.fill(255);
  assert.equal(decodeQrFrame(empty), null);
});

await test('câmera libera tracks ao ler, cancelar, expirar e quando a permissão chega tarde', async (t) => {
  const receipt = 'abc01234'.repeat(4);
  const image = raster(qrReceipt(receipt));
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {}, getImageData: () => image }),
  };
  const video = {
    srcObject: null,
    readyState: 2,
    videoWidth: image.width,
    videoHeight: image.height,
    pause() {},
    play: () => Promise.resolve(),
  };
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  );
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  );
  let stopped = 0;
  const stream = {
    getTracks: () => [
      {
        stop: () => {
          stopped += 1;
        },
      },
    ],
    getVideoTracks: () => [],
  } as unknown as MediaStream;
  let acquire: () => Promise<MediaStream> = () => Promise.resolve(stream);
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => canvas },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: (constraints: MediaStreamConstraints) => {
          assert.equal(constraints.audio, false);
          return acquire();
        },
      },
    },
  });
  t.after(() => {
    if (originalDocument)
      Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (originalNavigator)
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const decoded: string[] = [];
  const failures: string[] = [];
  const camera = new QrCamera({
    video: video as unknown as HTMLVideoElement,
    state() {},
    decoded: (value) => decoded.push(value),
    failed: (value) => failures.push(value),
  });
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
  camera.start('receipt');
  await flush();
  assert.deepEqual(decoded, [receipt]);
  assert.equal(stopped, 1);
  assert.equal(video.srcObject, null);
  assert.equal(camera.active, false);
  let late: ((value: MediaStream) => void) | undefined;
  acquire = () =>
    new Promise((resolve) => {
      late = resolve;
    });
  camera.start('receipt');
  camera.stop();
  late?.(stream);
  await flush();
  assert.equal(stopped, 2);
  assert.equal(decoded.length, 1);
  camera.start('receipt');
  t.mock.timers.tick(10_000);
  assert.equal(camera.active, false);
  assert.equal(failures.length, 1);
  late?.(stream);
  await flush();
  assert.equal(stopped, 3);
  acquire = () => Promise.reject(new Error('Permission denied'));
  camera.start('receipt');
  await flush();
  assert.equal(camera.active, false);
  assert.equal(failures.length, 2);
  assert.equal(video.srcObject, null);
  acquire = () => Promise.resolve(stream);
  camera.start('link'); // A confirmation QR is rejected in the request stage.
  await flush();
  assert.equal(camera.active, false);
  assert.equal(failures.length, 3);
  image.data.fill(255);
  camera.start('receipt');
  await flush();
  assert.equal(camera.active, true);
  t.mock.timers.tick(60_000);
  assert.equal(camera.active, false);
  assert.equal(failures.length, 4);
  assert.equal(video.srcObject, null);
});
