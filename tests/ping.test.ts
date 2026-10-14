import assert from 'node:assert/strict';
import test from 'node:test';
import { pingChipMarkup, pingMarkup } from '../src/client/ping/index.ts';

await test('Ping chip writes app text as text, never as markup', () => {
  const chip = pingChipMarkup('alert', '<img src=x onerror=alert(1)> & co');
  assert.ok(!chip.includes('<img'));
  assert.ok(chip.includes('&lt;img src=x onerror=alert(1)&gt; &amp; co'));
});

await test('each Ping on a page keeps its own gradient and stays decorative', () => {
  const first = pingMarkup('hello');
  const second = pingMarkup('salute', 'sm');
  const id = (svg: string) => /id="([^"]+)"/u.exec(svg)?.[1];
  assert.notEqual(id(first), id(second));
  for (const svg of [first, second]) {
    assert.match(svg, /aria-hidden="true"/u);
    assert.ok(svg.includes(`url(#${id(svg)})`));
  }
});
