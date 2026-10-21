import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import { WorkInterruption } from '../src/client/synchronization-work/index.ts';
import { dmFailure } from '../src/client/communities/dm-failures.ts';

await test('public navigation preserves explicit continuation but never hides transport or same-account authorization failures', () => {
  assert.equal(
    dmFailure(new WorkInterruption('continuation'), {
      sameSession: true,
      current: true,
    }),
    'continue',
  );
  assert.equal(
    dmFailure(new DOMException('Transport ended', 'AbortError'), {
      sameSession: true,
      current: true,
    }),
    'fail',
  );
  assert.equal(
    dmFailure(new DOMException('Transport timeout', 'TimeoutError'), {
      sameSession: true,
      current: true,
    }),
    'fail',
  );
  for (const status of [401, 403, 409]) {
    const error = new AccountError(status, 'DM unavailable.');
    assert.equal(
      dmFailure(error, { sameSession: true, current: false }),
      'deny',
    );
    assert.equal(
      dmFailure(error, { sameSession: false, current: true }),
      'ignore',
    );
  }
});
