import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import type { BrowserContext, Request, Response } from '@playwright/test';
import { ChatMetrics } from './e2e/chat-metrics.ts';
import { deferred } from './fixtures/deferred.ts';

/** Transport events only; no browser, network, app or protocol is simulated. */
function transport() {
  const frame = { page: () => page };
  const page = Object.assign(new EventEmitter(), { mainFrame: () => frame });
  const context = Object.assign(new EventEmitter(), { pages: () => [page] });
  const request = (navigation = false) =>
    ({
      url: () =>
        navigation
          ? 'http://127.0.0.1/replacement'
          : 'http://127.0.0.1/api/account/devices/read',
      isNavigationRequest: () => navigation,
      frame: () => frame,
      postDataBuffer: () => null,
    }) as unknown as Request;
  const metrics = new ChatMetrics();
  const stop = metrics.observeNetwork(context as unknown as BrowserContext);
  const send = (input: Request) => {
    context.emit('request', input);
    page.emit('request', input);
  };
  return { frame, page, context, request, metrics, stop, send };
}
await test('document commit cancels late old-document work but preserves new-document requests', () => {
  const f = transport();
  try {
    f.send(f.request(true));
    f.send(f.request());
    assert.equal(f.metrics.report().work.activeRequests, 1);
    assert.equal(f.metrics.report().complete, false);
    f.page.emit('framenavigated', f.frame);
    assert.equal(f.metrics.report().work.activeRequests, 0);
    assert.equal(f.metrics.operations.get('devices/read')?.documentCanceled, 1);
    assert.equal(f.metrics.report().complete, false);
    const fresh = f.request();
    f.send(fresh);
    assert.equal(f.metrics.report().work.activeRequests, 1);
    f.context.emit('requestfinished', fresh);
    assert.equal(f.metrics.report().work.activeRequests, 0);
  } finally {
    f.stop();
  }
});
await test('failed navigation retains pending work and a timed-out drain never becomes complete', async () => {
  const f = transport();
  try {
    const navigation = f.request(true),
      active = f.request();
    f.send(navigation);
    f.send(active);
    f.page.emit('requestfailed', navigation);
    f.page.emit('framenavigated', f.frame);
    assert.equal(f.metrics.report().work.activeRequests, 1);
    assert.equal(f.metrics.operations.get('devices/read')?.documentCanceled, 0);
    await assert.rejects(f.metrics.drain(1), /Work did not drain/u);
    f.context.emit('requestfinished', active);
    assert.equal(f.metrics.report().work.activeRequests, 0);
    assert.equal(f.metrics.report().complete, false);
  } finally {
    f.stop();
  }
});
await test('pending response observations prevent completeness after a request finishes', async () => {
  const f = transport();
  try {
    const sizes = deferred<{ responseBodySize: number }>();
    const request = Object.assign(f.request(), { sizes: () => sizes.promise });
    f.send(request);
    const response = {
      request: () => request,
      status: () => 200,
    } as unknown as Response;
    f.context.emit('response', response);
    f.context.emit('requestfinished', request);
    assert.equal(f.metrics.report().work.activeRequests, 0);
    assert.equal(f.metrics.report().work.pendingResponses, 1);
    assert.equal(f.metrics.report().complete, false);
    sizes.resolve({ responseBodySize: 0 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.metrics.report().complete, true);
  } finally {
    f.stop();
  }
});
await test('network observer disposal removes page and context listeners', () => {
  const f = transport();
  f.stop();
  for (const name of [
    'request',
    'response',
    'requestfinished',
    'requestfailed',
    'page',
  ])
    assert.equal(f.context.listenerCount(name), 0);
  for (const name of ['request', 'requestfailed', 'framenavigated', 'close'])
    assert.equal(f.page.listenerCount(name), 0);
  f.send(f.request());
  assert.equal(f.metrics.report().work.activeRequests, 0);
});
