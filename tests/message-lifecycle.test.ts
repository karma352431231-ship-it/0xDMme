import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindMessageLifecycle } from '../src/client/messages/lifecycle.ts';

await test('bfcache retains one lifecycle binding; permanent departure closes events, timer and channels', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const window = new EventTarget(),
    document = new EventTarget();
  const channels: TestChannel[] = [];
  class TestChannel extends EventTarget {
    closed = false;
    constructor() {
      super();
      channels.push(this);
    }
    close(): void {
      this.closed = true;
    }
  }
  const globals = { window, document, BroadcastChannel: TestChannel };
  const saved = Object.keys(globals).map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  let ticks = 0,
    controls = 0,
    online = 0,
    hides = 0,
    shows = 0,
    freezes = 0,
    resumes = 0;
  const close = bindMessageLifecycle({
    offline() {},
    online: () => {
      online++;
    },
    visibility() {},
    freeze: () => {
      freezes++;
    },
    resume: () => {
      resumes++;
    },
    controls: () => {
      controls++;
    },
    devices() {},
    imported() {},
    preferences() {},
    tick: () => {
      ticks++;
      return Promise.resolve();
    },
    progress() {},
    beforeUnload() {},
    pageHide: () => {
      hides++;
    },
    pageShow: () => {
      shows++;
    },
  });
  t.after(close);
  const page = (name: string, persisted: boolean) =>
    window.dispatchEvent(Object.assign(new Event(name), { persisted }));
  window.dispatchEvent(new Event('online'));
  window.dispatchEvent(new Event('0xdmme-message-controls'));
  document.dispatchEvent(new Event('freeze'));
  document.dispatchEvent(new Event('resume'));
  assert.equal(freezes, 1);
  assert.equal(resumes, 1);
  page('pagehide', true);
  page('pageshow', true);
  t.mock.timers.tick(30000);
  assert.equal(ticks, 1);
  assert.equal(online, 1);
  assert.equal(controls, 1);
  assert.equal(shows, 1);
  assert.equal(hides, 1);
  assert.ok(channels.every((channel) => !channel.closed));
  page('pagehide', false);
  document.dispatchEvent(new Event('freeze'));
  document.dispatchEvent(new Event('resume'));
  assert.equal(freezes, 1);
  assert.equal(resumes, 1);
  window.dispatchEvent(new Event('online'));
  window.dispatchEvent(new Event('0xdmme-message-controls'));
  page('pageshow', true);
  t.mock.timers.tick(30000);
  assert.equal(ticks, 1);
  assert.equal(online, 1);
  assert.equal(controls, 1);
  assert.equal(shows, 1);
  assert.equal(hides, 2);
  assert.ok(channels.every((channel) => channel.closed));
});
