import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bindMenuBackdrop,
  startTransientMenus,
} from '../src/client/transient-menu/index.ts';
import { CommunityNode } from './fixtures/community-dom.ts';

function disclosure(className: string) {
  const summary = Object.assign(new CommunityNode('summary'), {
    focused: false,
    focus() {
      this.focused = true;
    },
  });
  const menu = Object.assign(new CommunityNode('details'), { open: true });
  menu.className = className;
  menu.append(summary);
  return { menu, summary };
}
function dispatch(root: EventTarget, type: string, properties: object): void {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(properties))
    Object.defineProperty(event, key, { value });
  root.dispatchEvent(event);
}

await test('delegated dismissal covers current and dynamically mounted menus without changing settings or drafts', (context) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Node');
  Object.defineProperty(globalThis, 'Node', {
    configurable: true,
    value: CommunityNode,
  });
  context.after(() => {
    if (previous) Object.defineProperty(globalThis, 'Node', previous);
    else Reflect.deleteProperty(globalThis, 'Node');
  });
  const menus = [
    'directory-create-menu',
    'chat-options',
    'community-more',
    'post-more',
    'discovery-menu',
    'community-post-more',
    'group-member-menu',
    'settings-section',
  ].map(disclosure);
  let modal: CommunityNode | null = null;
  const root = Object.assign(new EventTarget(), {
    querySelector: () => modal,
    querySelectorAll: (selector: string) =>
      menus
        .filter(
          ({ menu }) =>
            menu.open && selector.includes(`details.${menu.className}[open]`),
        )
        .map(({ menu }) => menu),
  });
  const document = root as unknown as Document;
  startTransientMenus(document);
  startTransientMenus(document);
  const nested = disclosure('discovery-menu');
  menus.push(nested);
  const outer = menus[0]!;
  outer.menu.append(nested.menu);
  const input = new CommunityNode('textarea');
  input.value = 'Unsaved synthetic draft';
  nested.menu.append(input);
  dispatch(root, 'click', { target: input });
  assert.equal(outer.menu.open, true);
  assert.equal(nested.menu.open, true);
  assert.equal(menus[1]!.menu.open, false);
  modal = new CommunityNode('dialog');
  dispatch(root, 'keydown', { key: 'Escape', target: modal });
  assert.equal(outer.menu.open, true);
  assert.equal(nested.menu.open, true);
  modal = null;
  dispatch(root, 'keydown', { key: 'Escape', target: input });
  assert.equal(nested.menu.open, false);
  assert.equal(nested.summary.focused, true);
  assert.equal(outer.menu.open, true);
  dispatch(root, 'click', { target: new CommunityNode('main') });
  assert.ok(
    menus
      .filter(({ menu }) => menu.className !== 'settings-section')
      .every(({ menu }) => !menu.open),
  );
  assert.equal(menus[7]!.menu.open, true);
  assert.equal(input.value, 'Unsaved synthetic draft');
});

await test('only an opted-in options dialog closes on its backdrop, not on internal whitespace or child controls', () => {
  const menu = Object.assign(new CommunityNode('dialog'), {
    open: true,
    close() {
      this.open = false;
    },
    getBoundingClientRect: () => ({
      left: 100,
      right: 300,
      top: 100,
      bottom: 300,
    }),
  });
  bindMenuBackdrop(menu as unknown as HTMLDialogElement);
  dispatch(menu, 'click', { target: menu, clientX: 200, clientY: 200 });
  assert.equal(menu.open, true);
  dispatch(menu, 'click', {
    target: new CommunityNode('button'),
    clientX: 150,
    clientY: 150,
  });
  assert.equal(menu.open, true);
  dispatch(menu, 'click', { target: menu, clientX: 50, clientY: 150 });
  assert.equal(menu.open, false);
});
