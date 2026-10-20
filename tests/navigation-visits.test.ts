import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NavigationVisits } from '../src/client/app/navigation-visits.ts';

await test('tab returns reuse the contact view and independent scroll positions, and session reset drops both', (t) => {
  const scroll = { scrollTop: 80 },
    workspace = { scrollTop: 120 } as HTMLElement;
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { scrollingElement: scroll },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const contacts = {} as HTMLElement;
  const original = { querySelector: () => contacts } as unknown as HTMLElement;
  let restored: HTMLElement | null = null;
  const next = {
    querySelector: () => ({
      replaceWith: (node: HTMLElement) => {
        restored = node;
      },
    }),
  } as unknown as HTMLElement;
  const visits = new NavigationVisits();
  visits.save('contatos', original, workspace);
  workspace.scrollTop = 250;
  scroll.scrollTop = 350;
  visits.save('conversas', original, workspace);
  visits.restoreContacts(next);
  assert.equal(restored, contacts);
  visits.restorePosition('contatos', workspace);
  assert.equal(workspace.scrollTop, 120);
  assert.equal(scroll.scrollTop, 80);
  visits.restorePosition('conversas', workspace);
  assert.equal(workspace.scrollTop, 250);
  assert.equal(scroll.scrollTop, 350);
  visits.save('contatos', original, workspace);
  visits.clear();
  restored = null;
  visits.restoreContacts(next);
  visits.restorePosition('contatos', workspace);
  assert.equal(restored, null);
  assert.equal(workspace.scrollTop, 0);
  assert.equal(scroll.scrollTop, 0);
});
