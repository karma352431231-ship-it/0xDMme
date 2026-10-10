import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  poseModelIdentity,
  readPoseModerationConfiguration,
} from '../src/server/public-moderation/index.ts';

await test('aceite privado exige hash exato, caminhos completos e processador; sem configuração permanece desativado', async () => {
  assert.equal(await readPoseModerationConfiguration({}), null);
  const identity = await poseModelIdentity();
  const environment = {
    HASH_TALK_MODERATION_ACCEPTED_HASH: identity.hash,
    HASH_TALK_MODERATION_PYTHON: '/private/inference/python',
    HASH_TALK_MODERATION_MODELS: '/private/inference/models',
    HASH_TALK_MEDIA_FFMPEG: '/private/media/ffmpeg',
    HASH_TALK_MEDIA_FFPROBE: '/private/media/ffprobe',
  };
  assert.deepEqual(
    (await readPoseModerationConfiguration(environment))?.model,
    identity,
  );
  for (const change of [
    { HASH_TALK_MODERATION_ACCEPTED_HASH: '0'.repeat(64) },
    { HASH_TALK_MODERATION_PYTHON: 'python' },
    { HASH_TALK_MODERATION_MODELS: undefined },
    { HASH_TALK_MEDIA_FFMPEG: undefined, HASH_TALK_MEDIA_FFPROBE: undefined },
  ])
    await assert.rejects(
      readPoseModerationConfiguration({ ...environment, ...change }),
    );
});
