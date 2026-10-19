import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mediaEditor } from '../src/client/community-media/index.ts';
import { bytesHash } from '../src/shared/vault/index.ts';
import type { CommunityMediaState } from '../src/shared/community-media/index.ts';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';

await test('erro de preparação sai do progresso e permite retomar a mesma mídia', async () => {
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
