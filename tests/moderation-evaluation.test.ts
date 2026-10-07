import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { EvaluationApi } from '../src/client/moderation-evaluation/api.ts';
import {
  evaluationModelHash,
  evaluationResult,
  evaluationCase,
  evaluationReference,
  evaluationRound,
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

const calibrationCase = {
  model: 'viddexa/nsfw-detection-2-nano',
  modelHash: evaluationModelHash,
  elapsedMs: 123,
  scores: { safe: 0.1, hentai: 0.1, porn: 0.1, sexy: 0.1, drawing: 0.6 },
  id: '10000000-0000-4000-8000-000000000001',
  imageHash: 'a'.repeat(64),
  previewHash: 'b'.repeat(64),
  mime: 'image/png',
  bytes: 30,
  previewBytes: 10,
  createdAt: 1000,
  reference: 'uncertain',
};

await test('cliente confere bytes, MIME e hash antes de mostrar a imagem associada ao caso', async () => {
  const originalFetch = globalThis.fetch;
  const bytes = new TextEncoder().encode('own-image');
  const entry = evaluationCase({
    ...calibrationCase,
    bytes: bytes.length,
    imageHash: createHash('sha256').update(bytes).digest('hex'),
  });
  const api = new EvaluationApi('a'.repeat(64));
  try {
    globalThis.fetch = (path, init) => {
      assert.equal(path, `/api/cases/${entry.id}/image`);
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        `Bearer ${'a'.repeat(64)}`,
      );
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.redirect, 'error');
      return Promise.resolve(
        new Response(bytes, { headers: { 'Content-Type': 'image/png' } }),
      );
    };
    const signal = new AbortController().signal;
    const reopened = new EvaluationApi('');
    await assert.rejects(reopened.image(entry, 'image', signal), /Acesso/);
    assert.throws(() => reopened.acceptAccess('invalid'), /Acesso/);
    reopened.acceptAccess('a'.repeat(64));
    assert.equal(
      (await reopened.image(entry, 'image', signal)).size,
      bytes.length,
    );
    assert.equal((await api.image(entry, 'image', signal)).size, bytes.length);
    await assert.rejects(
      api.image({ ...entry, imageHash: 'f'.repeat(64) }, 'image', signal),
      /Hash/,
    );
    await assert.rejects(
      api.image({ ...entry, bytes: 1 }, 'image', signal),
      /excedida/,
    );
    await assert.rejects(
      api.image({ ...entry, mime: 'image/jpeg' }, 'image', signal),
      /divergente/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
await test('galeria valida identidade, referência explícita e orçamento total sem confundir casos', () => {
  assert.deepEqual(evaluationCase(calibrationCase), calibrationCase);
  assert.throws(() => evaluationReference(''));
  for (const changes of [
    { id: '../image' },
    { imageHash: 'invalid' },
    { previewBytes: 600_000 },
    { bytes: 0 },
    { reference: 'approved' },
  ])
    assert.throws(() => evaluationCase({ ...calibrationCase, ...changes }));
  const round = {
    roundId: calibrationCase.id,
    expiresAt: 2000,
    usedBytes: 40,
    maxBytes: 1024,
    maxCases: 256,
    cases: [calibrationCase],
  };
  assert.deepEqual(evaluationRound(round), round);
  for (const changes of [
    { usedBytes: 0 },
    { maxBytes: 39 },
    { maxCases: 257 },
    { cases: [calibrationCase, calibrationCase], usedBytes: 80 },
  ])
    assert.throws(() => evaluationRound({ ...round, ...changes }));
});
