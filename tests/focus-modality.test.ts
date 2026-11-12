import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keyboardNavigation } from '../src/client/focus-modality/index.ts';

await test('modifier keys and shortcuts keep a clicked area unmarked; navigation keys bring rings back', () => {
  const key = (
    name: string,
    held: Partial<Record<'ctrlKey' | 'altKey' | 'metaKey', boolean>> = {},
  ) => ({
    key: name,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...held,
  });
  for (const name of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', ''])
    assert.equal(keyboardNavigation(key(name)), false, name);
  assert.equal(keyboardNavigation(key('c', { metaKey: true })), false);
  assert.equal(keyboardNavigation(key('c', { ctrlKey: true })), false);
  for (const name of ['Tab', 'ArrowDown', 'Enter', ' ', 'Escape'])
    assert.equal(keyboardNavigation(key(name)), true, name);
});
