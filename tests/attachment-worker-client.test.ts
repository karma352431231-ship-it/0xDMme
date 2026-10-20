import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { attachmentWork } from '../src/client/attachments/worker-client.ts';

const bundle = await build({
  entryPoints: ['src/client/attachments/worker-client.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'attachmentClient',
  define: { ATTACHMENT_WORKER_URL: '"/synthetic-worker.js"' },
});
function workerFixture(steps: ('start-error' | 'file-error' | 'ok')[]) {
  let started = 0,
    terminated = 0;
  const context: Record<string, unknown> = {
    setTimeout,
    clearTimeout,
    Error,
    Worker: class {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(url: string) {
        assert.equal(url, '/synthetic-worker.js');
        started++;
      }
      terminate() {
        terminated++;
      }
      postMessage(input: unknown) {
        const step = steps.shift();
        queueMicrotask(() => {
          if (step === 'start-error') this.onerror?.();
          else
            this.onmessage?.({
              data:
                step === 'file-error'
                  ? { error: 'Invalid file.' }
                  : { result: input },
            });
        });
      }
    },
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const client = context['attachmentClient'] as {
    attachmentWork: typeof attachmentWork;
  };
  return { client, counts: () => ({ started, terminated }) };
}
await test('a transient worker startup error retries once and keeps multiple local jobs serialized', async () => {
  const { client, counts } = workerFixture(['ok', 'start-error', 'ok', 'ok']);
  assert.deepEqual(
    await Promise.all([1, 2, 3].map((value) => client.attachmentWork(value))),
    [1, 2, 3],
  );
  assert.deepEqual(counts(), { started: 4, terminated: 4 });
});
await test('startup retries are bounded, file errors do not retry, and the queue recovers', async () => {
  const { client, counts } = workerFixture([
    'start-error',
    'start-error',
    'file-error',
    'ok',
  ]);
  await assert.rejects(
    client.attachmentWork(1),
    /Local attachment processing unavailable/u,
  );
  await assert.rejects(client.attachmentWork(2), /Invalid file/u);
  assert.equal(await client.attachmentWork(3), 3);
  assert.deepEqual(counts(), { started: 4, terminated: 4 });
});
