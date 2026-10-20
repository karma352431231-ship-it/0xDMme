import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConversationInteractions } from '../src/tools/chat-diagnostics/interactions.ts';
import { observeSyncTriggers } from '../src/tools/chat-diagnostics/triggers.ts';
import { Recording } from '../src/tools/chat-diagnostics/recording.ts';
import { CommunityNode } from './fixtures/community-dom.ts';

await test('conversation actions distinguish repeat selection and switching using anonymous row slots', (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Element');
  Object.defineProperty(globalThis, 'Element', {
    configurable: true,
    value: CommunityNode,
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'Element', original);
    else Reflect.deleteProperty(globalThis, 'Element');
  });
  const choices = new ConversationInteractions();
  const one = new CommunityNode(),
    two = new CommunityNode();
  for (const row of [one, two]) {
    row.className = 'conversation-row';
    row.textContent = 'Private contact';
    row.dataset['conversation'] = 'Private account';
  }
  one.setAttribute('aria-pressed', 'true');
  two.setAttribute('aria-pressed', 'false');
  const first = choices.read(one);
  assert.deepEqual(first, {
    category: 'conversation-open',
    slot: 1,
    alreadySelected: true,
  });
  assert.deepEqual(choices.read(two), {
    category: 'conversation-open',
    slot: 2,
    alreadySelected: false,
  });
  one.setAttribute('aria-pressed', 'false');
  assert.deepEqual(choices.read(one), {
    category: 'conversation-open',
    slot: 1,
    alreadySelected: false,
  });
  assert.equal(JSON.stringify(first).includes('Private'), false);
  assert.equal(choices.read(null), null);
});

await test('sync trigger observers record causes without posting or continuing after stop', (t) => {
  const original = ['window', 'BroadcastChannel'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const service = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  const host = new EventTarget(),
    worker = new EventTarget(),
    channels: Channel[] = [];
  class Channel extends EventTarget {
    closed = false;
    readonly name: string;
    constructor(name: string) {
      super();
      this.name = name;
      channels.push(this);
    }
    postMessage() {
      assert.fail('Observers must not send application wakeups');
    }
    close() {
      this.closed = true;
    }
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: host,
  });
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    configurable: true,
    value: Channel,
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: worker,
  });
  t.after(() => {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    if (service) Object.defineProperty(navigator, 'serviceWorker', service);
    else Reflect.deleteProperty(navigator, 'serviceWorker');
  });
  const capture = new Recording(),
    stop = observeSyncTriggers(capture.record);
  t.after(stop);
  host.dispatchEvent(new Event('0xdmme-message-controls'));
  worker.dispatchEvent(
    Object.assign(new Event('message'), {
      data: { type: 'ACTIVITY_CHANGED', text: 'Private message' },
    }),
  );
  worker.dispatchEvent(
    Object.assign(new Event('message'), {
      data: { type: 'UNRELATED', text: 'Private message' },
    }),
  );
  channels[0]!.dispatchEvent(
    Object.assign(new Event('message'), { data: 'Private message' }),
  );
  assert.deepEqual(
    capture.report().events.map((event) => event.kind),
    ['local-trigger', 'push-wakeup', 'cross-tab-trigger'],
  );
  assert.equal(
    JSON.stringify(capture.report()).includes('Private message'),
    false,
  );
  stop();
  const count = capture.report().events.length;
  host.dispatchEvent(new Event('0xdmme-message-controls'));
  worker.dispatchEvent(
    Object.assign(new Event('message'), { data: { type: 'ACTIVITY_CHANGED' } }),
  );
  channels[0]!.dispatchEvent(new Event('message'));
  assert.equal(capture.report().events.length, count);
  assert.ok(channels.every((channel) => channel.closed));
});
