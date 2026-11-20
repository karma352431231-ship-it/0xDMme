import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkedParts } from '../src/client/link-text/index.ts';

await test('links in chats and posts: http(s) and www. become links, the rest stays text', () => {
  const cases: [string, [string, string | null][]][] = [
    [
      'Olha essa bomba:\n\nhttps://x.com/sherwoodagent',
      [
        ['Olha essa bomba:\n\n', null],
        ['https://x.com/sherwoodagent', 'https://x.com/sherwoodagent'],
      ],
    ],
    [
      'see www.example.com/a, then (http://a.io).',
      [
        ['see ', null],
        ['www.example.com/a', 'https://www.example.com/a'],
        [', then (', null],
        ['http://a.io', 'http://a.io/'],
        [').', null],
      ],
    ],
    [
      'javascript:alert(1) stays text',
      [['javascript:alert(1) stays text', null]],
    ],
    [
      'https://user:pass@evil.example/x is refused',
      [['https://user:pass@evil.example/x is refused', null]],
    ],
    ['', []],
  ];
  for (const [text, expected] of cases)
    assert.deepEqual(
      linkedParts(text).map((part) => [part.text, part.href]),
      expected,
      text,
    );
});
