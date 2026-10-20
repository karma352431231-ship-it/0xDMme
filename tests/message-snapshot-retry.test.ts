import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retrySnapshotRead } from '../src/client/messages/snapshot-retry.ts';
import { ApiResponseError } from '../src/client/api-response/index.ts';

function conflict(
  status = 409,
  message = 'Messages or permissions changed. Sync again.',
) {
  return new ApiResponseError({
    operation: 'messages/delivery',
    status,
    failure: 'http',
    responseType: 'json',
    message,
  });
}
await test('snapshot retry is bounded and cannot retry revoked authority, unrelated conflicts or an old session', async () => {
  for (const [error, current, attempts] of [
    [conflict(), true, 2],
    [conflict(403), true, 1],
    [conflict(409, 'Another conflict.'), true, 1],
    [conflict(), false, 1],
  ] as const) {
    let calls = 0;
    await assert.rejects(
      retrySnapshotRead(
        () => {
          calls++;
          return Promise.reject(error);
        },
        () => current,
      ),
      (actual) => actual === error,
    );
    assert.equal(calls, attempts);
  }
});
