import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InstalledSessionChannel } from '../src/client/installed-runtime/channel.ts';

interface Wire {
  call: string;
  document: string;
  operation: string;
  request: Record<string, unknown>;
}

function fixture() {
  const messages: Wire[] = [];
  const port = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage(message: string) {
      messages.push(JSON.parse(message) as Wire);
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const window = { ZeroXSession: port };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: window,
  });
  const channel = new InstalledSessionChannel();
  return {
    channel,
    window,
    messages,
    reply(value: unknown) {
      port.onmessage?.({ data: value });
    },
    close() {
      channel.close();
      if (previous) Object.defineProperty(globalThis, 'window', previous);
      else Reflect.deleteProperty(globalThis, 'window');
    },
  };
}

void test('installed channel binds a document nonce and preserves signed UTF-8 bytes', async () => {
  const f = fixture();
  try {
    const ready = f.channel.ready();
    const hello = f.messages[0]!;
    assert.equal(hello.operation, 'hello');
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(f.window, '__zeroXSessionDocument'),
      {
        value: hello.document,
        writable: false,
        configurable: false,
        enumerable: false,
      },
    );
    f.reply(JSON.stringify({ call: hello.call, value: true }));
    await ready;
    const body = JSON.stringify({
      message: 'Synthetic — 测试',
      signature: 'unchanged',
    });
    const pending = f.channel.open({
      id: crypto.randomUUID(),
      path: '/api/account/login',
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const open = f.messages[1]!;
    assert.equal(open.document, hello.document);
    assert.equal(open.request['body'], undefined);
    assert.equal(
      Buffer.from(String(open.request['bodyBase64']), 'base64').toString(
        'utf8',
      ),
      body,
    );
    f.reply(
      JSON.stringify({ call: open.call, value: { status: 200, headers: {} } }),
    );
    assert.deepEqual(await pending, { status: 200, headers: {} });
    const cancel = f.channel.cancel({ id: String(open.request['id']) });
    f.reply(JSON.stringify({ call: f.messages[2]!.call, value: null }));
    await cancel;
  } finally {
    f.close();
  }
});

void test('protected frame diagnostics require the explicit native capability and validate their metadata', async () => {
  const f = fixture();
  try {
    const id = crypto.randomUUID(),
      signal = new AbortController().signal;
    assert.deepEqual(await f.channel.viewPresented({ id, signal }), {
      state: 'unavailable',
      elapsedMs: 0,
    });
    assert.equal(f.messages.length, 0);
    Object.assign(f.window, { __0xdmmeNativeDiagnostics: true });
    const result = f.channel.viewPresented({ id, signal });
    const call = f.messages[0]!;
    assert.equal(call.operation, 'view-frame');
    f.reply(
      JSON.stringify({
        call: call.call,
        value: { state: 'native-draw', elapsedMs: 17 },
      }),
    );
    assert.deepEqual(await result, { state: 'native-draw', elapsedMs: 17 });
    const invalid = f.channel.viewPresented({ id, signal });
    f.reply(
      JSON.stringify({
        call: f.messages[1]!.call,
        value: { state: 'native-draw', elapsedMs: -1 },
      }),
    );
    await assert.rejects(invalid, TypeError);
  } finally {
    f.close();
  }
});

void test('malformed native replies close the channel and reject every retained operation', async () => {
  const f = fixture();
  try {
    const first = f.channel.read({ id: crypto.randomUUID(), bytes: 32 });
    const second = f.channel.read({ id: crypto.randomUUID(), bytes: 32 });
    const rejected = [
      assert.rejects(first, TypeError),
      assert.rejects(second, TypeError),
    ];
    f.reply(
      JSON.stringify({
        call: f.messages[0]!.call,
        value: {},
        cookie: 'forbidden',
      }),
    );
    await Promise.all(rejected);
    await assert.rejects(
      f.channel.read({ id: crypto.randomUUID(), bytes: 32 }),
      TypeError,
    );
  } finally {
    f.close();
  }
});

void test('native failures are scoped and pending replies have an admission bound', async () => {
  const f = fixture();
  try {
    const operations = Array.from({ length: 24 }, () =>
      f.channel.read({ id: crypto.randomUUID(), bytes: 32 }),
    );
    const rejected = operations.map((operation) =>
      assert.rejects(operation, TypeError),
    );
    await assert.rejects(
      f.channel.read({ id: crypto.randomUUID(), bytes: 32 }),
      TypeError,
    );
    f.reply(JSON.stringify({ call: f.messages[0]!.call, error: true }));
    const next = f.channel.read({ id: crypto.randomUUID(), bytes: 32 });
    const nextRejected = assert.rejects(next, TypeError);
    assert.equal(f.messages.length, 25);
    f.channel.close();
    await Promise.all([...rejected, nextRejected]);
  } finally {
    f.close();
  }
});

void test('installed startup accepts a still-initializing native owner after fifteen seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100_000 });
  t.mock.method(performance, 'now', () => Date.now());
  const f = fixture();
  let replied = 0;
  const ready = f.channel.ready().then(
    () => true,
    () => false,
  );
  try {
    for (let elapsed = 0; elapsed < 15_000; elapsed += 100) {
      const message = f.messages[replied];
      if (message) {
        replied++;
        f.reply(JSON.stringify({ call: message.call, value: false }));
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
      t.mock.timers.tick(100);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    t.mock.timers.tick(250);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const hello = f.messages.at(-1)!;
    f.reply(JSON.stringify({ call: hello.call, value: true }));
    assert.equal(await ready, true);
  } finally {
    f.close();
  }
});

void test('installed startup stops polling after its absolute deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100_000 });
  t.mock.method(performance, 'now', () => Date.now());
  const f = fixture();
  let replied = 0;
  const ready = assert.rejects(f.channel.ready(), TypeError);
  try {
    for (let elapsed = 0; elapsed <= 30_000; elapsed += 250) {
      const message = f.messages[replied];
      if (message) {
        replied++;
        f.reply(JSON.stringify({ call: message.call, value: false }));
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
      t.mock.timers.tick(250);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    await ready;
    assert.ok(f.messages.length <= 120);
    const count = f.messages.length;
    t.mock.timers.tick(60_000);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(f.messages.length, count);
  } finally {
    f.close();
  }
});

void test('installed startup rejects native denial without polling or opening HTTP', async () => {
  const f = fixture();
  try {
    const ready = assert.rejects(f.channel.ready(), TypeError);
    f.reply(JSON.stringify({ call: f.messages[0]!.call, error: true }));
    await ready;
    assert.deepEqual(
      f.messages.map((message) => message.operation),
      ['hello'],
    );
  } finally {
    f.close();
  }
});
