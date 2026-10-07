import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  publicAvatar,
  publicAvatarPath,
} from '../src/shared/public-media/index.ts';
import { publicProfile } from '../src/shared/public-profile/index.ts';
import { PublicMediaService } from '../src/server/public-media/index.ts';
import { AccountError } from '../src/shared/account/index.ts';

await test('avatar público: referência só da própria origem, tipo e alvo; URL não concede acesso', () => {
  const target = crypto.randomUUID(),
    review = crypto.randomUUID(),
    path = publicAvatarPath('avatar', target, review);
  assert.equal(
    publicProfile({ id: target, handle: 'sintetico', avatar: path }).avatar,
    path,
  );
  for (const value of [
    `https://external.invalid${path}`,
    `${path}?private=1`,
    `${path}#fragment`,
    publicAvatarPath('avatar', crypto.randomUUID(), review),
    publicAvatarPath('community-photo', target, review),
    '/api/public-media/avatar/../../segredo',
  ])
    assert.throws(() => publicAvatar(value, 'avatar', target), AccountError);
});
await test('leitura pública: substituição entre as consultas não devolve bytes anteriores', async () => {
  let first = true;
  const service = new PublicMediaService({
    profiles: {
      releasedAvatar: () => {
        const result = first
          ? { type: 'image/png' as const, bytes: new Uint8Array([1]) }
          : null;
        first = false;
        return Promise.resolve(result);
      },
    },
    communities: { releasedPhoto: () => Promise.resolve(null) },
  });
  await assert.rejects(
    service.avatar('avatar', crypto.randomUUID(), crypto.randomUUID()),
    (error: unknown) => error instanceof AccountError && error.status === 404,
  );
});
