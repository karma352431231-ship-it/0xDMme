import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DmDrafts } from '../src/client/communities/dm-drafts.ts';

await test('@ chat drafts come back once per conversation and blank text is not kept', () => {
  const drafts = new DmDrafts();
  drafts.keep('peer-a', 'Unsent to A');
  drafts.keep('peer-b', '   ');
  assert.equal(drafts.size, 1);
  assert.equal(drafts.take('peer-b'), '');
  assert.equal(drafts.take('peer-a'), 'Unsent to A');
  assert.equal(drafts.take('peer-a'), '', 'handed back once');
  drafts.keep('peer-a', 'Again');
  drafts.keep('peer-a', '');
  assert.equal(drafts.size, 0, 'emptying the text drops the draft');
});

await test('@ chat drafts stay bounded, dropping the oldest conversation', () => {
  const drafts = new DmDrafts();
  for (let index = 0; index < 51; index++)
    drafts.keep(`peer-${index}`, `draft ${index}`);
  assert.equal(drafts.size, 50);
  assert.equal(drafts.take('peer-0'), '');
  assert.equal(drafts.take('peer-50'), 'draft 50');
  drafts.clear();
  assert.equal(drafts.size, 0);
});
