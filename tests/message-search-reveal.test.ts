import assert from 'node:assert/strict';
import { test } from 'node:test';
import { revealMessage } from '../src/client/messages/search-reveal.ts';

function fakeRow() {
  const classes = new Set<string>();
  let centered = 0;
  const row = {
    offsetWidth: 1,
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
    },
    addEventListener: () => undefined,
    scrollIntoView: () => {
      centered++;
    },
  };
  return {
    row: row as unknown as HTMLElement,
    marked: () => classes.has('search-match'),
    centered: () => centered,
  };
}

await test('a search match outside the recent window is revealed after older pages load', async () => {
  const target = fakeRow();
  let pages = 0;
  const found = await revealMessage('m1', {
    row: (id) => (id === 'm1' && pages >= 2 ? target.row : null),
    older: {
      available: () => true,
      load: () => Promise.resolve(++pages > 0),
    },
    valid: () => true,
  });
  assert.equal(found, true);
  assert.equal(pages, 2);
  assert.equal(target.marked(), true);
  assert.equal(target.centered(), 1);
});

await test('revealing stops without a match when history ends, a read fails or the chat changes', async () => {
  const none = { row: () => null };
  assert.equal(
    await revealMessage('m1', {
      ...none,
      older: { available: () => false, load: () => assert.fail('No read') },
      valid: () => true,
    }),
    false,
  );
  assert.equal(
    await revealMessage('m1', {
      ...none,
      older: { available: () => true, load: () => Promise.resolve(false) },
      valid: () => true,
    }),
    false,
  );
  let open = true,
    reads = 0;
  assert.equal(
    await revealMessage('m1', {
      ...none,
      older: {
        available: () => true,
        load: () => {
          reads++;
          open = false;
          return Promise.resolve(true);
        },
      },
      valid: () => open,
    }),
    false,
  );
  assert.equal(reads, 1);
  let bounded = 0;
  assert.equal(
    await revealMessage('m1', {
      ...none,
      older: {
        available: () => true,
        load: () => Promise.resolve(++bounded > 0),
      },
      valid: () => true,
    }),
    false,
  );
  assert.ok(bounded > 0 && bounded <= 24);
});
