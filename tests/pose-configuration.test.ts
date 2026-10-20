import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  poseModelIdentity,
  readPoseModerationConfiguration,
} from '../src/server/public-moderation/index.ts';

await test('private approval requires exact hash, full paths and processor; absent configuration stays disabled', async () => {
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

await test('previous approval preserves approvals without replacing the new analysis identity', async () => {
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

await test('two exact approvals allow switching and rollback without accepting a mismatched pipeline', async () => {
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

await test('exact list preserves both approved generations, requires the current one and rejects other pipelines', async () => {
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

await test('next-detector approval preserves three generations and requires exact identity without duplication', async () => {
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

await test('contextual correction preserves four historical approvals and requires exact approval of the next', async () => {
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

await test('banner routing preserves five prior approvals and requires an exact sixth identity', async () => {
  const identity = await poseModelIdentity();
  const predecessors = [
    '6ae4df3886df584b0d2de91d52febf0e3967851da628b6e6ef0d03a4669f7d74',
    '1271c7deba0443c4f53c76295c0789c9cdf766b53a5c9875ab560c2c5a7b7c58',
    '409455c7f259b71f0d9d2c60704613267da0c597f47c42b6ea92bbaf7f001a3f',
    'b0c665c56bed28a0630d379a13f90d202322d5a6a924901ca5da2dbeafa89ef0',
    'adfa19fa323553c4cb172cc4b959db447203ec454815cf5e305c872a9ee7efcd',
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
  assert.deepEqual(
    (await readPoseModerationConfiguration(environment))?.acceptedModels.map(
      ({ hash }) => hash,
    ),
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
  ])
    await assert.rejects(
      readPoseModerationConfiguration({ ...environment, ...change }),
    );
});

await test('source text revision preserves six prior approvals and requires an exact seventh identity', async () => {
  const identity = await poseModelIdentity();
  const predecessors = [
    '409455c7f259b71f0d9d2c60704613267da0c597f47c42b6ea92bbaf7f001a3f',
    '1271c7deba0443c4f53c76295c0789c9cdf766b53a5c9875ab560c2c5a7b7c58',
    '6ae4df3886df584b0d2de91d52febf0e3967851da628b6e6ef0d03a4669f7d74',
    'b0c665c56bed28a0630d379a13f90d202322d5a6a924901ca5da2dbeafa89ef0',
    'adfa19fa323553c4cb172cc4b959db447203ec454815cf5e305c872a9ee7efcd',
    '12c1cd1b6b504f1e476da8b58c07f034aaf2addfbd03fa0c2d2f074f6f3cea1f',
  ];
  const environment = {
    HASH_TALK_MODERATION_ACCEPTED_HASH: predecessors[2],
    HASH_TALK_MODERATION_APPROVED_PREDECESSOR: predecessors[2],
    HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH: identity.hash,
    HASH_TALK_MODERATION_ACCEPTED_PIPELINES: predecessors.join(','),
    HASH_TALK_MODERATION_PYTHON: '/private/inference/python',
    HASH_TALK_MODERATION_MODELS: '/private/inference/models',
    HASH_TALK_MEDIA_FFMPEG: '/private/media/ffmpeg',
    HASH_TALK_MEDIA_FFPROBE: '/private/media/ffprobe',
  };
  assert.deepEqual(
    (await readPoseModerationConfiguration(environment))?.acceptedModels.map(
      ({ hash }) => hash,
    ),
    [...predecessors, identity.hash],
  );
  for (const change of [
    { HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH: undefined },
    { HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH: predecessors[5] },
    {
      HASH_TALK_MODERATION_ACCEPTED_PIPELINES: [
        ...predecessors,
        'e'.repeat(64),
      ].join(','),
    },
    {
      HASH_TALK_MODERATION_ACCEPTED_PIPELINES: [
        ...predecessors,
        identity.hash,
        identity.hash,
      ].join(','),
    },
  ])
    await assert.rejects(
      readPoseModerationConfiguration({ ...environment, ...change }),
    );
});
