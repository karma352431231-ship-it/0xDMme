import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluationModelHash,
  evaluationResult,
} from '../src/shared/moderation-evaluation/index.ts';

await test('resultado experimental valida distribuição e não concede decisão de publicação', () => {
  const result = {
    model: 'viddexa/nsfw-detection-2-nano',
    modelHash: evaluationModelHash,
    elapsedMs: 123,
    scores: { safe: 0.1, hentai: 0.1, porn: 0.1, sexy: 0.1, drawing: 0.6 },
  };
  assert.deepEqual(evaluationResult(result), result);
  for (const scores of [
    { ...result.scores, porn: NaN },
    { ...result.scores, drawing: 0.8 },
    { ...result.scores, extra: 0 },
    { safe: 1 },
  ])
    assert.throws(() => evaluationResult({ ...result, scores }));
  assert.throws(() => evaluationResult({ ...result, model: 'unknown' }));
  assert.throws(() =>
    evaluationResult({ ...result, modelHash: 'a'.repeat(64) }),
  );
});
