import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import {
  publicModerationNotice,
  publicModerationPolicy,
} from '../src/shared/public-moderation/index.ts';
import { validateModerationEvaluation } from '../src/server/database/index.ts';
import type {
  PublicModerationClaim,
  PublicModerationEvaluation,
} from '../src/server/database/index.ts';

const job: PublicModerationClaim = {
  id: crypto.randomUUID(),
  owner: crypto.randomUUID(),
  kind: 'post-media',
  target: crypto.randomUUID(),
  contentHash: 'a'.repeat(64),
  policy: publicModerationPolicy,
  lease: crypto.randomUUID(),
  modelHash: 'b'.repeat(64),
  runtime: 'isolated-test',
};
const result: PublicModerationEvaluation = {
  verdict: 'hold',
  contentHash: job.contentHash,
  modelHash: job.modelHash,
  frames: 1_800,
  expectedFrames: 1_800,
};
await test('análise exige os bytes/modelo exatos e cobertura temporal integral', () => {
  validateModerationEvaluation(job, result);
  for (const changed of [
    { contentHash: 'c'.repeat(64) },
    { modelHash: 'c'.repeat(64) },
    { frames: 0 },
    { frames: 1_799 },
    { frames: NaN },
    { frames: 60_002, expectedFrames: 60_002 },
    { expectedFrames: 1_801 },
  ])
    assert.throws(
      () => validateModerationEvaluation(job, { ...result, ...changed }),
      AccountError,
    );
});
await test('aviso ao autor não admite identidades privadas, scores ou bytes de outro objeto', () => {
  const notice = {
    id: job.id,
    kind: job.kind,
    target: job.target,
    status: 'held',
    createdAt: '2026-10-06T00:00:00.000Z',
    expiresAt: '2026-10-13T00:00:00.000Z',
    appeal: null,
    decision: null,
  };
  assert.deepEqual(publicModerationNotice(notice), notice);
  assert.deepEqual(
    publicModerationNotice({
      ...notice,
      afterPublication: true,
      warning: true,
    }),
    { ...notice, afterPublication: true, warning: true },
  );
  for (const flags of [
    { warning: true },
    { afterPublication: true, kind: 'avatar' },
    { afterPublication: 'true' },
    { afterPublication: true, warning: 1 },
  ])
    assert.throws(
      () => publicModerationNotice({ ...notice, ...flags }),
      AccountError,
    );
  for (const field of ['accountId', 'wallet', 'deviceId', 'bytes', 'scores'])
    assert.throws(
      () => publicModerationNotice({ ...notice, [field]: 'restrito' }),
      AccountError,
    );
  assert.throws(
    () => publicModerationNotice({ ...notice, status: 'bypass' }),
    AccountError,
  );
  assert.throws(
    () => publicModerationNotice({ ...notice, kind: 'private-dm' }),
    AccountError,
  );
  assert.throws(
    () => publicModerationNotice({ ...notice, expiresAt: 'invalid' }),
    AccountError,
  );
});
