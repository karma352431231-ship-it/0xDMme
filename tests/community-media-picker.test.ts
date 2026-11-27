import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ChosenUploads,
  mediaEditor,
} from '../src/client/community-media/index.ts';
import { bytesHash } from '../src/shared/vault/index.ts';
import type { CommunityMediaState } from '../src/shared/community-media/index.ts';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';

await test('preparation error leaves progress state and allows resuming the same media', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: communityDocument(),
  });
  const abort = new AbortController();
  try {
    const file = new File([new Uint8Array(10)], 'synthetic.gif', {
      type: 'image/gif',
    });
    const state: CommunityMediaState = {
      source: {
        id: crypto.randomUUID(),
        kind: 'gif',
        bytes: file.size,
        hash: await bytesHash(new Uint8Array(await file.arrayBuffer())),
      },
      received: 1,
      status: 'uploading',
      result: null,
      error: null,
    };
    let fail = true;
    const host = new CommunityNode();
    const send = mediaEditor(host as unknown as HTMLElement, [], {
      community: crypto.randomUUID(),
      valid: () => true,
      signal: abort.signal,
      request: (operation) => {
        if (operation === 'media-pending') return Promise.resolve([state]);
        if (operation === 'media-finish') {
          if (fail) return Promise.resolve({ ...state, status: 'processing' });
          return Promise.resolve({
            ...state,
            status: 'ready',
            error: null,
            result: {
              kind: 'gif',
              type: 'image/gif',
              bytes: 100,
              width: 32,
              height: 32,
              seconds: 1,
              fps: 20,
              thumbnailBytes: 50,
              normalized: true,
            },
          });
        }
        if (operation === 'media-status')
          return Promise.resolve({
            ...state,
            error: 'Isolated processor unavailable.',
          });
        return Promise.resolve(state);
      },
    });
    const picker = host.querySelector('.media-picker');
    assert.ok(picker);
    Object.assign(picker, { isConnected: true });
    const input = picker.querySelector('input');
    assert.ok(input);
    Object.assign(input, { files: [file] });
    input.dispatchEvent(new Event('change'));
    const status = picker.querySelector('small');
    assert.ok(status);
    await assert.rejects(send(), /Isolated processor unavailable/u);
    assert.equal(status.textContent, 'Isolated processor unavailable.');
    fail = false;
    assert.deepEqual(await send(), [state.source.id]);
    assert.equal(status.textContent, '');
  } finally {
    abort.abort();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

/** A server that finishes every upload at once, unless `held` keeps each
 * finish until released, and records each operation. */
function mediaServer() {
  const states = new Map<string, CommunityMediaState>(),
    operations: string[] = [],
    cancelled: string[] = [],
    held: { on: boolean; release: Array<() => void> } = {
      on: false,
      release: [],
    };
  const ready = (state: CommunityMediaState): CommunityMediaState => ({
    ...state,
    status: 'ready',
    result: {
      kind: 'gif',
      type: 'image/gif',
      bytes: 100,
      width: 32,
      height: 32,
      seconds: 1,
      fps: 20,
      thumbnailBytes: 50,
      normalized: true,
    },
  });
  const request = (operation: string, payload: Record<string, unknown>) => {
    operations.push(operation);
    if (operation === 'media-pending') return Promise.resolve([]);
    if (operation === 'media-reserve') {
      const source = payload['source'] as CommunityMediaState['source'];
      const state: CommunityMediaState = {
        source,
        received: 0,
        status: 'uploading',
        result: null,
        error: null,
      };
      states.set(source.id, state);
      return Promise.resolve(state);
    }
    const id = String(payload['media']),
      state = states.get(id)!;
    if (operation === 'media-part') state.received++;
    if (operation === 'media-finish') {
      if (held.on)
        return new Promise((resolve) =>
          held.release.push(() => {
            states.set(id, ready(state));
            resolve(states.get(id));
          }),
        );
      states.set(id, ready(state));
    }
    if (operation === 'media-cancel') cancelled.push(id);
    return Promise.resolve(states.get(id));
  };
  return {
    request,
    operations,
    cancelled,
    held,
    ids: () => [...states.keys()],
  };
}

async function withEditor(
  work: (editor: {
    send: () => Promise<string[]>;
    choose: (files: File[]) => void;
    host: CommunityNode;
    close: () => void;
    server: ReturnType<typeof mediaServer>;
  }) => Promise<void>,
): Promise<void> {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: communityDocument(),
  });
  const abort = new AbortController(),
    server = mediaServer(),
    host = new CommunityNode();
  try {
    const send = mediaEditor(host as unknown as HTMLElement, [], {
      community: crypto.randomUUID(),
      valid: () => !abort.signal.aborted,
      signal: abort.signal,
      request: server.request,
    });
    const picker = host.querySelector('.media-picker')!;
    Object.assign(picker, { isConnected: true });
    const input = picker.querySelector('input')!;
    await work({
      send,
      host,
      server,
      close: () => abort.abort(),
      choose: (files) => {
        Object.assign(input, { files });
        input.dispatchEvent(new Event('change'));
      },
    });
  } finally {
    abort.abort();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}
const gif = (name: string) =>
  new File([crypto.getRandomValues(new Uint8Array(10))], name, {
    type: 'image/gif',
  });
/** Uploads hash on the thread pool, so a busy runner needs real time. */
const settle = async (done: () => boolean) => {
  const deadline = Date.now() + 10_000;
  while (!done() && Date.now() < deadline)
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
};

await test('chosen pictures upload before Publish, which then only waits for what is left', async () => {
  await withEditor(async ({ send, choose, server }) => {
    choose([gif('a.gif'), gif('b.gif')]);
    await settle(
      () => server.operations.filter((op) => op === 'media-finish').length > 1,
    );
    assert.equal(
      server.operations.filter((op) => op === 'media-finish').length,
      2,
      'Both files were sent while the post was still being written',
    );
    const before = server.operations.length;
    assert.deepEqual(await send(), server.ids());
    assert.equal(server.operations.length, before, 'Publish sent nothing new');
  });
});

await test('a removed picture and an unpublished draft are cancelled, a published upload is kept', async () => {
  await withEditor(async ({ send, choose, host, close, server }) => {
    choose([gif('a.gif'), gif('b.gif')]);
    await settle(() => server.ids().length === 2);
    const [first, second] = server.ids();
    host.querySelectorAll('.media-picker-remove')[0]!.click();
    await settle(() => server.cancelled.length > 0);
    assert.deepEqual(server.cancelled, [first]);
    assert.deepEqual(await send(), [second]);
    choose([gif('c.gif')]);
    await settle(() => server.ids().length === 3);
    const third = server.ids()[2];
    close();
    await settle(() => server.cancelled.length > 1);
    assert.deepEqual(
      server.cancelled,
      [first, third],
      'The file handed to a publish is never cancelled',
    );
  });
});

await test('three chosen files upload at once and the next starts when one is done', async () => {
  const server = mediaServer(),
    abort = new AbortController();
  server.held.on = true;
  const uploads = new ChosenUploads(
    {
      community: crypto.randomUUID(),
      valid: () => true,
      signal: abort.signal,
      request: server.request,
    },
    { progress() {}, failed() {} },
  );
  const reserves = () =>
    server.operations.filter((op) => op === 'media-reserve').length;
  const files = ['a', 'b', 'c', 'd'].map((name) => gif(`${name}.gif`));
  try {
    uploads.update(files);
    await settle(() => server.held.release.length === 3);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    assert.equal(reserves(), 3, 'The fourth waits for a free place');
    server.held.release.shift()!();
    await settle(() => reserves() === 4);
    assert.equal(reserves(), 4);
    server.held.on = false;
    for (const release of server.held.release.splice(0)) release();
    assert.deepEqual(
      await uploads.ids(files),
      server.ids(),
      'Ids keep the choice order',
    );
  } finally {
    abort.abort();
  }
});
