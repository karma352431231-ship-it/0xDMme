import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { ChatAvatarPhoto } from '../src/client/chat-ui/index.ts';
import { CommunityNode } from './fixtures/community-dom.ts';

class ViewerNode extends CommunityNode {
  src = '';
  alt = '';
  isConnected = true;
  naturalWidth = 480;
  clientWidth = 320;
  style = { width: '', height: '' };
  focus() {}
  showModal() {}
  override classList = {
    add: (...names: string[]) => {
      this.className += ' ' + names.join(' ');
    },
    toggle: (name: string, enabled: boolean) => {
      this.className = this.className
        .split(' ')
        .filter((part) => part !== name)
        .join(' ');
      if (enabled) this.className += ' ' + name;
    },
  };
}
function fixture(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const body = new ViewerNode('body');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { body, createElement: (tag: string) => new ViewerNode(tag) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('The avatar viewer must reuse local bytes.');
  });
  const trigger = new ViewerNode('button');
  const photo = new ChatAvatarPhoto(),
    lifetime = new AbortController();
  const input = {
    trigger: trigger as unknown as HTMLButtonElement,
    peer: 'synthetic-peer',
    signal: lifetime.signal,
  };
  return { body, trigger, photo, lifetime, input, fetch };
}

await test('private photo enlargement reuses its URL, survives repaint, and closes for replacement or another peer', (t) => {
  const f = fixture(t),
    ready = f.photo.bind(f.input);
  assert.equal(f.trigger.disabled, true);
  ready('blob:synthetic-private-photo');
  f.trigger.click();
  const dialog = f.body.querySelector('dialog');
  assert.ok(dialog);
  assert.equal(
    (dialog.querySelector('img') as ViewerNode).src,
    'blob:synthetic-private-photo',
  );
  assert.equal(f.photo.bind(f.input), ready);
  ready('blob:synthetic-private-photo');
  assert.equal(f.body.querySelector('dialog'), dialog);
  ready('blob:replacement');
  assert.equal(f.body.querySelector('dialog'), null);
  f.trigger.click();
  assert.ok(f.body.querySelector('dialog'));
  const next = f.photo.bind({ ...f.input, peer: 'other-peer' });
  assert.equal(f.body.querySelector('dialog'), null);
  ready('blob:stale-peer');
  assert.equal(f.trigger.disabled, true);
  next(null);
  assert.equal(f.trigger.disabled, true);
  assert.equal(f.fetch.mock.callCount(), 0);
  f.photo.clear();
});

await test('zoom toggles fit/full size; Escape, navigation and session reset close private images', (t) => {
  const f = fixture(t),
    ready = f.photo.bind(f.input);
  ready('blob:synthetic');
  f.trigger.click();
  const dialog = f.body.querySelector('dialog')!;
  const zoom = dialog.querySelector('button')!;
  zoom.click();
  assert.equal(zoom.getAttribute('aria-pressed'), 'true');
  assert.equal(
    (dialog.querySelector('img') as ViewerNode).style.width,
    '640px',
  );
  zoom.click();
  assert.equal(zoom.getAttribute('aria-pressed'), 'false');
  assert.equal((dialog.querySelector('img') as ViewerNode).style.width, '');
  dialog.dispatchEvent(new Event('cancel'));
  assert.equal(f.body.querySelector('dialog'), null);
  f.trigger.click();
  f.lifetime.abort();
  assert.equal(f.body.querySelector('dialog'), null);
  assert.equal(f.trigger.disabled, true);
  ready('blob:late');
  f.trigger.click();
  assert.equal(f.body.querySelector('dialog'), null);
  assert.equal(f.fetch.mock.callCount(), 0);
  f.photo.clear();
});
