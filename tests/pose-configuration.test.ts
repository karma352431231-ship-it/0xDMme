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
    { HASH_TALK_MODERATION_APPROVED_PREDECESSOR: '0'.repeat(64) },
    { HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH: '0'.repeat(64) },
    { HASH_TALK_MODERATION_PYTHON: 'python' },
    { HASH_TALK_MODERATION_MODELS: undefined },
    { HASH_TALK_MEDIA_FFMPEG: undefined, HASH_TALK_MEDIA_FFPROBE: undefined },
  ])
    await assert.rejects(
      readPoseModerationConfiguration({ ...environment, ...change }),
    );
});

await test('aceite anterior preserva aprovações, mas não substitui a identidade da nova análise', async () => {
  const identity = await poseModelIdentity();
  const predecessor =
    '6ae4df3886df584b0d2de91d52febf0e3967851da628b6e6ef0d03a4669f7d74';
  const environment = {
    HASH_TALK_MODERATION_ACCEPTED_HASH: identity.hash,
    HASH_TALK_MODERATION_APPROVED_PREDECESSOR: predecessor,
    HASH_TALK_MODERATION_PYTHON: '/private/inference/python',
    HASH_TALK_MODERATION_MODELS: '/private/inference/models',
    HASH_TALK_MEDIA_FFMPEG: '/private/media/ffmpeg',
    HASH_TALK_MEDIA_FFPROBE: '/private/media/ffprobe',
  };
  const config = await readPoseModerationConfiguration(environment);
  assert.deepEqual(config?.model, identity);
  assert.deepEqual(
    config?.acceptedModels.map(({ hash }) => hash),
    [identity.hash, predecessor],
  );
  await assert.rejects(
    readPoseModerationConfiguration({
      ...environment,
      HASH_TALK_MODERATION_ACCEPTED_HASH: predecessor,
    }),
  );
});

await test('dois aceites exatos permitem a troca e o rollback sem aceitar pipeline divergente', async () => {
  const identity = await poseModelIdentity();
  const environment = {
    HASH_TALK_MODERATION_ACCEPTED_HASH:
      '6ae4df3886df584b0d2de91d52febf0e3967851da628b6e6ef0d03a4669f7d74',
    HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH: identity.hash,
    HASH_TALK_MODERATION_APPROVED_PREDECESSOR:
      '6ae4df3886df584b0d2de91d52febf0e3967851da628b6e6ef0d03a4669f7d74',
    HASH_TALK_MODERATION_PYTHON: '/private/inference/python',
    HASH_TALK_MODERATION_MODELS: '/private/inference/models',
    HASH_TALK_MEDIA_FFMPEG: '/private/media/ffmpeg',
    HASH_TALK_MEDIA_FFPROBE: '/private/media/ffprobe',
  };
  const config = await readPoseModerationConfiguration(environment);
  assert.deepEqual(config?.model, identity);
  assert.equal(config?.acceptedModels.length, 2);
  await assert.rejects(
    readPoseModerationConfiguration({
      ...environment,
      HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH: 'f'.repeat(64),
    }),
  );
});
