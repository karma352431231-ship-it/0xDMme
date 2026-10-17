import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

await test('ranking sidebar styles never reuse the ranking table classes', async () => {
  const css = await readFile('src/client/communities/ranking-side.css', 'utf8');
  const classes = new Set(css.match(/\.ranking-[a-z-]+/gu) ?? []);
  assert.ok(classes.size > 0);
  for (const name of classes)
    assert.match(
      name,
      /^\.ranking-side(?:-|$)/u,
      `${name} collides with the table`,
    );
});
