import assert from 'node:assert/strict';
import { test } from 'node:test';
import { watchOlderHistory } from '../src/client/chat-ui/index.ts';
import { deferred } from './fixtures/deferred.ts';

await test('near-top scrolling waits for admission, recovers after failure and ignores a replaced window', async () => {
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
  });
  const history = Object.assign(new EventTarget(), {
    ownerDocument: document,
    isConnected: true,
    clientHeight: 0,
    hidden: false,
    scrollTop: 30,
  });
  const button = Object.assign(new EventTarget(), {
    hidden: true,
    disabled: false,
    textContent: '',
  });
  const lifetime = new AbortController();
  const previous = deferred<boolean>();
  const replacement = deferred<boolean>();
  const pages = [Promise.resolve(false), previous.promise, replacement.promise];
  let conversation = 'original';
  let ready = false;
  let reads = 0;
  const watcher = watchOlderHistory({
    history: history as unknown as HTMLElement,
    button: button as unknown as HTMLButtonElement,
    available: () => true,
    ready: () => ready,
    conversation: () => conversation,
    oldest: () => 50,
    load: () => pages[reads++]!,
    signal: lifetime.signal,
  });
  watcher.check();
  history.clientHeight = 150;
  watcher.check();
  assert.equal(reads, 0);
  ready = true;
  document.visibilityState = 'hidden';
  watcher.check();
  assert.equal(reads, 0);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(reads, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(button.hidden, false);
  watcher.check();
  assert.equal(reads, 1);
  history.scrollTop = 400;
  history.dispatchEvent(new Event('scroll'));
  history.scrollTop = 60;
  history.dispatchEvent(new Event('scroll'));
  watcher.check();
  assert.equal(reads, 2);
  assert.equal(button.disabled, true);
  conversation = 'replacement';
  watcher.check();
  assert.equal(reads, 3);
  previous.resolve(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(button.disabled, true);
  lifetime.abort();
  replacement.resolve(true);
  history.dispatchEvent(new Event('scroll'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reads, 3);
});
