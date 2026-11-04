import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dmSafetyNotice } from '../src/client/communities/dm-safety-notice.ts';
import { CommunityNode } from './fixtures/community-dom.ts';

await test('dismissing a safety notice removes mounted notices and persists only a device flag', (t) => {
  const values = new Map<string, string>();
  const chip = new CommunityNode('div');
  const parent = new CommunityNode('section');
  const previous = ['document', 'localStorage'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (tag: string) =>
        tag === 'div'
          ? { innerHTML: '', firstElementChild: chip }
          : new CommunityNode(tag),
      querySelectorAll: () => [chip],
    },
  });
  t.after(() =>
    previous.forEach(([key, saved]) => {
      if (saved) Object.defineProperty(globalThis, key, saved);
      else Reflect.deleteProperty(globalThis, key);
    }),
  );
  const notice = dmSafetyNotice();
  assert.equal(notice, chip);
  parent.append(chip);
  chip.querySelector('.dm-safety-close')!.click();
  assert.equal(chip.parent, null);
  assert.deepEqual([...values], [['0xdmme:dm-safety-dismissed', 'true']]);
  assert.equal(dmSafetyNotice(), null);
});
