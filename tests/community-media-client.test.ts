import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  uploadCommunityMedia,
  validateMediaSelection,
} from '../src/client/community-media/index.ts';
import { communityMediaPartBytes } from '../src/shared/community-media/index.ts';
import type { CommunityMediaState } from '../src/shared/community-media/index.ts';
import { bytesHash } from '../src/shared/vault/index.ts';
await test('cliente público aplica quantidade/mistura antes do envio e retoma partes recebidas', async () => {
  const bytes = new Uint8Array(communityMediaPartBytes + 10).fill(5),
    file = new File([bytes], 'sintetico.gif', { type: 'image/gif' });
  const source = {
    id: crypto.randomUUID(),
    kind: 'gif' as const,
    bytes: bytes.length,
    hash: await bytesHash(bytes),
  };
  const current: CommunityMediaState = {
    source,
    received: 1,
    status: 'uploading',
    result: null,
    error: null,
  };
  const parts: number[] = [],
    access = {
      community: crypto.randomUUID(),
      valid: () => true,
      signal: new AbortController().signal,
      request: (
        operation: string,
        payload: Record<string, unknown>,
      ): Promise<unknown> => {
        if (operation === 'media-pending') return Promise.resolve([current]);
        if (operation === 'media-part') {
          parts.push(Number(payload['index']));
          current.received = 2;
        }
        if (operation === 'media-finish') {
          current.status = 'ready';
          current.result = {
            kind: 'gif',
            type: 'image/gif',
            bytes: 100,
            width: 32,
            height: 32,
            seconds: 1,
            fps: 20,
            thumbnailBytes: 50,
            normalized: true,
          };
        }
        return Promise.resolve(current);
      },
    };
  assert.deepEqual(await uploadCommunityMedia(access, [file], () => {}), [
    source.id,
  ]);
  assert.deepEqual(parts, [1]);
  assert.throws(() =>
    validateMediaSelection([
      file,
      new File([bytes], 'foto.png', { type: 'image/png' }),
    ]),
  );
  assert.throws(() =>
    validateMediaSelection(Array.from({ length: 4 }, () => file)),
  );
  validateMediaSelection(Array.from({ length: 3 }, () => file));
});
await test('troca de contexto durante preparação interrompe o envio seguinte', async () => {
  let valid = true;
  const access = {
    community: crypto.randomUUID(),
    valid: () => valid,
    signal: new AbortController().signal,
    request: () => {
      valid = false;
      return Promise.resolve([]);
    },
  };
  await assert.rejects(
    uploadCommunityMedia(
      access,
      [new File([new Uint8Array(10)], 'synthetic.gif', { type: 'image/gif' })],
      () => {},
    ),
    /Sessão ou comunidade alterada/u,
  );
});
