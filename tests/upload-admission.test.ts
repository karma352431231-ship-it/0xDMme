import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withUploadAdmission } from '../src/server/database/upload-admission.ts';
import { reserveOperationMemory } from '../src/server/memory-admission/index.ts';
import { deferred } from './fixtures/deferred.ts';

await test('reservation admission shares memory with transfers and recovers after failed work', async (t) => {
  let available = 2_097_152;
  t.mock.method(process, 'availableMemory', () => available);
  const releaseTransfer = reserveOperationMemory(1_048_576);
  assert.ok(releaseTransfer);
  const entered = deferred<void>(),
    release = deferred<void>();
  const running = withUploadAdmission(async () => {
    entered.resolve();
    await release.promise;
    throw new Error('database rejected the reservation');
  });
  const failed = assert.rejects(running, /database rejected/);
  try {
    await entered.promise;
    await assert.rejects(
      withUploadAdmission(() => {
        assert.fail(
          'pressure must reject before opening a database transaction',
        );
      }),
      { status: 503 },
    );
  } finally {
    release.resolve();
    releaseTransfer();
    await failed;
  }
  available = 1_048_576;
  assert.equal(
    await withUploadAdmission(() => Promise.resolve('recovered')),
    'recovered',
  );
  assert.equal(
    await withUploadAdmission(() => Promise.resolve('released after success')),
    'released after success',
  );
});
