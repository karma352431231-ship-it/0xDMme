import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { build } from 'esbuild';
import type { configuredPoseRunner } from '../src/server/public-moderation/configured-runner.ts';
import type { PublicModerationClaim } from '../src/server/database/index.ts';
import { publicModerationPolicy } from '../src/shared/public-moderation/index.ts';

// Keep the actual configured factory and scanner, including candidate/hash checks.
// Process startup, resource inspection and decoding/inference are synthetic IO.
const adapters: Record<string, string> = {
  './pose-detector.ts': `export class PoseFrameDetector {
    constructor(options) { this.model = options.model; }
    initialize() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }`,
  '../community-media/index.ts': `export class CommunityMediaFiles {}
    export const verifyMediaBudget = () => Promise.resolve();`,
  './frames.ts': `export const classifyPreparedFrames = () => {
    fixture.classified++;
    return Promise.resolve({ frames: 1, verdict: fixture.verdict });
  };`,
};
const bundle = await build({
  entryPoints: ['src/server/public-moderation/configured-runner.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'iife',
  globalName: 'configured',
  plugins: [
    {
      name: 'moderation-process-io',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path, importer }) => {
          if (
            adapters[path] &&
            /\/(configured-runner|scanner)\.ts$/u.test(importer)
          )
            return { path, namespace: 'fixture' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => {
          const contents = adapters[path];
          if (contents === undefined) throw new Error('Missing IO adapter.');
          return { contents, loader: 'js' };
        });
      },
    },
  ],
});

async function fixture(kind: PublicModerationClaim['kind']) {
  const bytes = new Uint8Array([1, 2, 3]);
  const state = {
    calls: [] as string[],
    verdict: 'hold',
    classified: 0,
    corrupt: false,
  };
  const candidate = (
    owner: 'profiles' | 'communities',
    job: PublicModerationClaim,
  ) => {
    state.calls.push(owner);
    const kinds =
      owner === 'profiles'
        ? ['avatar', 'profile-banner']
        : ['community-photo', 'community-banner'];
    return Promise.resolve(
      kinds.includes(job.kind)
        ? {
            type: 'image/png',
            bytes: state.corrupt ? new Uint8Array([9]) : bytes,
          }
        : null,
    );
  };
  const options = {
    db: {
      communities: {
        moderationCandidate: (job: PublicModerationClaim) =>
          candidate('communities', job),
      },
      publicProfiles: {
        moderationCandidate: (job: PublicModerationClaim) =>
          candidate('profiles', job),
      },
      communityMedia: { moderationCandidate: () => Promise.resolve(null) },
    },
    directory: '/synthetic/media',
    configuration: {
      python: '/synthetic/python',
      directory: '/synthetic/models',
      runtime: {
        ffmpeg: '/synthetic/ffmpeg',
        ffprobe: '/synthetic/ffprobe',
        limit: null,
      },
      model: { hash: 'b'.repeat(64), runtime: 'synthetic-routing' },
      acceptedModels: [],
    },
  };
  const context = {
    fixture: state,
    require: createRequire(import.meta.url),
    AbortSignal,
    Uint8Array,
    Error,
    configured: undefined as
      { configuredPoseRunner: typeof configuredPoseRunner } | undefined,
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  assert.ok(context.configured);
  const runner = await context.configured.configuredPoseRunner(
    options as unknown as Parameters<typeof configuredPoseRunner>[0],
  );
  assert.ok(runner);
  const job: PublicModerationClaim = {
    id: crypto.randomUUID(),
    owner: crypto.randomUUID(),
    target: crypto.randomUUID(),
    kind,
    lease: crypto.randomUUID(),
    policy: publicModerationPolicy,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    modelHash: options.configuration.model.hash,
    runtime: options.configuration.model.runtime,
  };
  return { runner, job, state };
}

for (const kind of [
  'avatar',
  'profile-banner',
  'community-photo',
  'community-banner',
] as const) {
  await test(`configured analysis reads the current ${kind} candidate from its byte owner`, async () => {
    const { runner, job, state } = await fixture(kind);
    try {
      const result = await runner.scanner.evaluate(
        job,
        new AbortController().signal,
      );
      assert.deepEqual(state.calls, [
        kind.startsWith('community-') ? 'communities' : 'profiles',
      ]);
      assert.equal(result.verdict, 'hold');
      assert.equal(result.contentHash, job.contentHash);
      assert.equal(state.classified, 1);
    } finally {
      await runner.close();
    }
  });
}

await test('a replaced community banner cannot reach inference or produce an approval', async () => {
  const { runner, job, state } = await fixture('community-banner');
  state.corrupt = true;
  try {
    await assert.rejects(
      runner.scanner.evaluate(job, new AbortController().signal),
    );
    assert.equal(state.classified, 0);
  } finally {
    await runner.close();
  }
});

for (const verdict of ['allow', 'reject'] as const) {
  await test(`a community banner preserves the detector's ${verdict} verdict`, async () => {
    const { runner, job, state } = await fixture('community-banner');
    state.verdict = verdict;
    try {
      const result = await runner.scanner.evaluate(
        job,
        new AbortController().signal,
      );
      assert.equal(result.verdict, verdict);
      assert.equal(result.frames, 1);
      assert.equal(result.expectedFrames, 1);
    } finally {
      await runner.close();
    }
  });
}
