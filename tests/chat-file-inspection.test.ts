import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { FileInspection } from '../src/tools/chat-diagnostics/file-inspection.ts';
import { waitForBoundary } from './fixtures/deferred.ts';

function readerFixture(t: TestContext, held = false) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
  let reads = 0,
    aborts = 0;
  class Reader {
    result: ArrayBuffer | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private stopped = false;
    readAsArrayBuffer(file: File): void {
      reads++;
      if (held) return;
      void file.arrayBuffer().then(
        (bytes) => {
          if (this.stopped) return;
          this.result = bytes;
          this.onload?.();
        },
        () => this.onerror?.(),
      );
    }
    abort(): void {
      aborts++;
      this.stopped = true;
      this.onabort?.();
    }
  }
  Object.defineProperty(globalThis, 'FileReader', {
    configurable: true,
    value: Reader,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'FileReader', previous);
    else Reflect.deleteProperty(globalThis, 'FileReader');
  });
  return { reads: () => reads, aborts: () => aborts };
}
function privateFile(bytes: Uint8Array, type: string): File {
  const file = new File([bytes as Uint8Array<ArrayBuffer>], 'private-name', {
    type,
  });
  Object.defineProperty(file, 'name', {
    get: () => {
      throw new Error('File inspection must not read the filename.');
    },
  });
  return file;
}

await test('local signature detection overrides misleading MIME and identical files receive one anonymous slot', async (t) => {
  readerFixture(t);
  const inspection = new FileInspection();
  t.after(() => inspection.stop());
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 123]);
  const first = privateFile(png, '');
  const a = await inspection.inspect(first);
  const b = await inspection.inspect(privateFile(png, 'video/mp4'));
  assert.equal(a.kind, 'image');
  assert.equal(a.signature, true);
  assert.equal(a.bytes, png.length);
  assert.equal(a.slot, b.slot);
  assert.equal(b.mismatch, true);
  const changed = Uint8Array.from(png);
  changed[8] = 124;
  assert.notEqual(
    (await inspection.inspect(privateFile(changed, 'image/png'))).slot,
    a.slot,
  );
  assert.deepEqual(
    new Uint8Array(await first.arrayBuffer()),
    png,
    'Inspection cannot mutate the app input.',
  );
  assert.doesNotMatch(JSON.stringify([a, b]), /private-name|[a-f0-9]{64}/u);
});

await test('automatic inspection recognizes supported video/image families and reports MIME-only fallback', async (t) => {
  readerFixture(t);
  const inspection = new FileInspection();
  t.after(() => inspection.stop());
  for (const [prefix, type, kind, signature] of [
    ['\u0000\u0000\u0000\u0018ftypmp42', '', 'video', true],
    [
      '\u0000\u0000\u0000\u0018ftypqt  ',
      'application/octet-stream',
      'video',
      true,
    ],
    ['GIF89a', '', 'image', true],
    ['RIFF0000WEBP', '', 'image', true],
    ['\u0000\u0000\u0000\u0018ftypavif', '', 'image', true],
    ['plain synthetic bytes', 'text/plain', 'file', false],
    ['plain synthetic bytes', '', 'unknown', false],
  ] as const) {
    const result = await inspection.inspect(
      privateFile(new TextEncoder().encode(prefix), type),
    );
    assert.equal(result.kind, kind);
    assert.equal(result.signature, signature);
  }
});

await test('stop aborts an active read, settles queued jobs and prevents further IO; size/queue budgets stay explicit', async (t) => {
  const reader = readerFixture(t, true);
  const inspection = new FileInspection();
  t.after(() => inspection.stop());
  const file = privateFile(new Uint8Array([1]), '');
  const queued = Array.from({ length: 16 }, () => inspection.inspect(file));
  const settled = Promise.allSettled(queued);
  await assert.rejects(inspection.inspect(file), /budget/u);
  await assert.rejects(
    inspection.inspect({ size: 16_000_001 } as File),
    /budget/u,
  );
  await Promise.resolve();
  assert.equal(reader.reads(), 1);
  inspection.stop();
  const outcomes = await waitForBoundary(settled);
  assert.ok(outcomes.every((outcome) => outcome.status === 'rejected'));
  assert.equal(reader.aborts(), 1);
  assert.equal(reader.reads(), 1);
});
