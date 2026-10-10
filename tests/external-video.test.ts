import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  externalVideoIds,
  youtubeVideoId,
} from '../src/shared/external-video/index.ts';

const id = 'M7lc1UVf-VE';
await test('player aceita somente IDs canônicos de URLs HTTPS do YouTube', () => {
  for (const link of [
    `https://youtu.be/${id}?si=tracking`,
    `https://www.youtube.com/watch?v=${id}&list=ignored`,
    `https://youtube.com/shorts/${id}`,
    `https://m.youtube.com/live/${id}`,
  ])
    assert.equal(youtubeVideoId(link), id);
  for (const link of [
    `http://youtu.be/${id}`,
    `https://youtube.com.evil.test/watch?v=${id}`,
    `https://evil.test/youtube.com/watch?v=${id}`,
    `https://user:password@youtube.com/watch?v=${id}`,
    `https://youtube.com:8080/watch?v=${id}`,
    `https://youtu.be/${id}/other`,
    `https://youtu.be/${id}%22`,
    'https://youtube.com/watch?v=too-short',
    'https://youtube.com/watch?v=AAAAAAAAAAAA',
    `javascript:alert('${id}')`,
    'not a URL',
    'https://youtu.be/' + 'x'.repeat(2048),
  ])
    assert.equal(youtubeVideoId(link), null);
});
await test('posts mantêm no máximo três players distintos e aceitam links entre parênteses', () => {
  assert.deepEqual(
    externalVideoIds(
      `(${`https://youtu.be/${id}`}). https://youtube.com/watch?v=${id}`,
    ),
    [id],
  );
  assert.deepEqual(
    externalVideoIds('https://example.org/video https://evil.test/youtube.com'),
    [],
  );
  assert.deepEqual(
    externalVideoIds(
      ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC', 'DDDDDDDDDDD']
        .map((value) => `https://youtu.be/${value}`)
        .join('\n'),
    ),
    ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC'],
  );
});
