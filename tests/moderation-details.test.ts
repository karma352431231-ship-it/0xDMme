import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicModerationDetails } from '../src/shared/moderation-details/index.ts';
import { publicModerationPolicy } from '../src/shared/public-moderation/index.ts';
import { AccountError } from '../src/shared/account/index.ts';
const detail = {
  notice: {
    id: crypto.randomUUID(),
    target: crypto.randomUUID(),
    kind: 'post-media',
    status: 'rejected',
    createdAt: '2026-10-12T10:00:00Z',
    expiresAt: '2026-10-19T10:00:00Z',
    appeal: null,
    decision: null,
  },
  policy: publicModerationPolicy,
  automaticVerdict: 'reject',
  frames: 1,
  post: {
    id: crypto.randomUUID(),
    community: crypto.randomUUID(),
    communityName: 'Comunidade',
    title: '',
    text: '',
    reply: true,
    deleted: false,
  },
};
await test('análise aceita post sem legenda e valida cada resultado externo sem inventar categorias', () => {
  assert.deepEqual(publicModerationDetails(detail), detail);
  for (const invalid of [
    { ...detail, policy: 'inventada' },
    { ...detail, automaticVerdict: 'genitais' },
    { ...detail, frames: -1 },
    { ...detail, frames: 60002 },
    { ...detail, post: { ...detail.post, reply: 'sim' } },
    { ...detail, post: { ...detail.post, text: 'x'.repeat(4001) } },
  ])
    assert.throws(() => publicModerationDetails(invalid), AccountError);
  assert.equal(
    publicModerationDetails({
      ...detail,
      post: null,
      frames: null,
      automaticVerdict: null,
    }).post,
    null,
  );
});
