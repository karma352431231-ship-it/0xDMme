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

await test('lista exata preserva as duas gerações aprovadas, exige atual e recusa outros pipelines', async () => {
  const identity = await poseModelIdentity();
  const previous = [
    '6ae4df3886df584b0d2de91d52febf0e3967851da628b6e6ef0d03a4669f7d74',
    '1271c7deba0443c4f53c76295c0789c9cdf766b53a5c9875ab560c2c5a7b7c58',
  ];
  const environment = {
    HASH_TALK_MODERATION_ACCEPTED_HASH: previous[0],
    HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH: previous[1],
    HASH_TALK_MODERATION_PYTHON: '/private/inference/python',
    HASH_TALK_MODERATION_MODELS: '/private/inference/models',
    HASH_TALK_MEDIA_FFMPEG: '/private/media/ffmpeg',
    HASH_TALK_MEDIA_FFPROBE: '/private/media/ffprobe',
    HASH_TALK_MODERATION_ACCEPTED_PIPELINES: [identity.hash, ...previous].join(
      ',',
    ),
  };
  const config = await readPoseModerationConfiguration(environment);
  assert.deepEqual(config?.model, identity);
  assert.deepEqual(
    config?.acceptedModels.map(({ hash }) => hash),
    [identity.hash, ...previous],
  );
  for (const hashes of [
    previous,
    [identity.hash, 'f'.repeat(64)],
    [identity.hash, identity.hash],
    [identity.hash, ...previous, identity.hash],
  ])
    await assert.rejects(
      readPoseModerationConfiguration({
        ...environment,
        HASH_TALK_MODERATION_ACCEPTED_PIPELINES: hashes.join(','),
      }),
    );
});

await test('aceite do próximo detector preserva as três gerações e exige identidade exata sem duplicações', async () => {
  const identity = await poseModelIdentity();
  const predecessors = [
    '6ae4df3886df584b0d2de91d52febf0e3967851da628b6e6ef0d03a4669f7d74',
    '1271c7deba0443c4f53c76295c0789c9cdf766b53a5c9875ab560c2c5a7b7c58',
    '409455c7f259b71f0d9d2c60704613267da0c597f47c42b6ea92bbaf7f001a3f',
  ];
  const environment = {
    HASH_TALK_MODERATION_ACCEPTED_HASH: predecessors[0],
    HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH: identity.hash,
    HASH_TALK_MODERATION_ACCEPTED_PIPELINES: predecessors.join(','),
    HASH_TALK_MODERATION_PYTHON: '/private/inference/python',
    HASH_TALK_MODERATION_MODELS: '/private/inference/models',
    HASH_TALK_MEDIA_FFMPEG: '/private/media/ffmpeg',
    HASH_TALK_MEDIA_FFPROBE: '/private/media/ffprobe',
  };
  const config = await readPoseModerationConfiguration(environment);
  assert.deepEqual(config?.model, identity);
  assert.deepEqual(
    config?.acceptedModels.map(({ hash }) => hash),
    [...predecessors, identity.hash],
  );
  for (const change of [
    { HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH: undefined },
    { HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH: 'f'.repeat(64) },
    {
      HASH_TALK_MODERATION_ACCEPTED_PIPELINES: [
        ...predecessors,
        predecessors[0],
      ].join(','),
    },
    {
      HASH_TALK_MODERATION_ACCEPTED_PIPELINES: [
        ...predecessors,
        'e'.repeat(64),
      ].join(','),
    },
    {
      HASH_TALK_MODERATION_ACCEPTED_PIPELINES: [
        identity.hash,
        ...predecessors,
        identity.hash,
      ].join(','),
    },
  ])
    await assert.rejects(
      readPoseModerationConfiguration({ ...environment, ...change }),
    );
});

await test('correção contextual conserva quatro aceites históricos e exige aceite exato do próximo', async () => {
  const identity = await poseModelIdentity();
  const predecessors = [
    '6ae4df3886df584b0d2de91d52febf0e3967851da628b6e6ef0d03a4669f7d74',
    '1271c7deba0443c4f53c76295c0789c9cdf766b53a5c9875ab560c2c5a7b7c58',
    '409455c7f259b71f0d9d2c60704613267da0c597f47c42b6ea92bbaf7f001a3f',
    'b0c665c56bed28a0630d379a13f90d202322d5a6a924901ca5da2dbeafa89ef0',
  ];
  const environment = {
    HASH_TALK_MODERATION_ACCEPTED_HASH: predecessors[0],
    HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH: identity.hash,
    HASH_TALK_MODERATION_ACCEPTED_PIPELINES: predecessors.join(','),
    HASH_TALK_MODERATION_PYTHON: '/private/inference/python',
    HASH_TALK_MODERATION_MODELS: '/private/inference/models',
    HASH_TALK_MEDIA_FFMPEG: '/private/media/ffmpeg',
    HASH_TALK_MEDIA_FFPROBE: '/private/media/ffprobe',
  };
  const config = await readPoseModerationConfiguration(environment);
  assert.deepEqual(
    config?.acceptedModels.map(({ hash }) => hash),
    [...predecessors, identity.hash],
  );
  for (const change of [
    { HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH: undefined },
    { HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH: 'f'.repeat(64) },
    {
      HASH_TALK_MODERATION_ACCEPTED_PIPELINES: [
        ...predecessors,
        identity.hash,
        identity.hash,
      ].join(','),
    },
    {
      HASH_TALK_MODERATION_ACCEPTED_PIPELINES: [
        ...predecessors,
        'e'.repeat(64),
      ].join(','),
    },
  ])
    await assert.rejects(
      readPoseModerationConfiguration({ ...environment, ...change }),
    );
});
