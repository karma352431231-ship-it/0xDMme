import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { object } from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { readMediaRuntime } from '../community-media/index.ts';
import type { MediaRuntime } from '../community-media/index.ts';

const project = new URL('../../../', import.meta.url);
export interface PoseModerationConfiguration {
  python: string;
  directory: string;
  runtime: MediaRuntime;
  model: { hash: string; runtime: string };
  acceptedModels: Array<{ hash: string; runtime: string }>;
}
export async function poseModelIdentity(): Promise<{
  hash: string;
  runtime: string;
}> {
  const manifest = object(
    JSON.parse(
      await readFile(
        new URL('infra/public-moderation/pose_models.json', project),
        'utf8',
      ),
    ),
  );
  const files = manifest['identityFiles'],
    runtime = manifest['runtime'];
  if (
    !Array.isArray(files) ||
    files.length < 1 ||
    files.length > 32 ||
    typeof runtime !== 'string' ||
    runtime.length > 120
  )
    throw new Error('Invalid inference manifest.');
  const digest = createHash('sha256');
  for (const value of files) {
    const name = identityPath(value);
    const bytes = await readFile(new URL(name, project)),
      length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    digest.update(length).update(bytes);
  }
  return { hash: digest.digest('hex'), runtime };
}
function identityPath(name: unknown): string {
  if (
    typeof name !== 'string' ||
    name.includes('..') ||
    !(
      name === 'src/shared/community-media/index.ts' ||
      /^(infra\/public-moderation|src\/server\/public-moderation)\/[\w./-]+$/u.test(
        name,
      )
    )
  )
    throw new Error('Invalid inference identity path.');
  return name;
}
/** The private operator's exact acceptance must match this authored pipeline; no upload flag selects it. */
export async function readPoseModerationConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<PoseModerationConfiguration | null> {
  const accepted = environment['HASH_TALK_MODERATION_ACCEPTED_HASH'],
    python = environment['HASH_TALK_MODERATION_PYTHON'],
    directory = environment['HASH_TALK_MODERATION_MODELS'],
    predecessor = environment['HASH_TALK_MODERATION_APPROVED_PREDECESSOR'],
    next = environment['HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH'],
    approvals = environment['HASH_TALK_MODERATION_ACCEPTED_PIPELINES'];
  const fields = [accepted, python, directory, predecessor, next, approvals];
  if (fields.every((field) => field === undefined)) return null;
  const paths = inferenceSettings({ accepted, python, directory });
  const model = await poseModelIdentity(),
    runtime = readMediaRuntime(environment);
  if (!runtime) throw new Error('Inference media runtime differs.');
  if (approvals !== undefined)
    return {
      python: paths.python,
      directory: paths.directory,
      runtime,
      model,
      acceptedModels: reviewedPipelines(model, approvals, next),
    };
  verifyAcceptance(model.hash, paths.accepted, next);
  const acceptedModels = [model];
  if (predecessor !== undefined) {
    // Owner-approved 11/10/2026 transition: preserve existing approvals only.
    // New scans still bind to the exact current authored pipeline identity.
    if (
      predecessor !==
      '6ae4df3886df584b0d2de91d52febf0e3967851da628b6e6ef0d03a4669f7d74'
    )
      throw new Error('Unreviewed inference predecessor.');
    if (predecessor !== model.hash)
      acceptedModels.push({
        hash: predecessor,
        runtime: 'python3.12-onnxruntime1.24.4-numpy2.3.5-pillow12.3.0-pose-v1',
      });
  }
  return {
    python: paths.python,
    directory: paths.directory,
    runtime,
    model,
    acceptedModels,
  };
}

/** Dual exact approvals let the existing executor roll back to the old source without changing configuration. */
function verifyAcceptance(
  hash: string,
  accepted: string,
  next: string | undefined,
): void {
  const previous = fingerprint(accepted);
  if (next !== undefined && fingerprint(next) !== hash)
    throw new Error('Next inference acceptance differs.');
  if (previous !== hash && next !== hash)
    throw new Error('Inference acceptance differs.');
}

/** Exact next acceptance adds this revision without breaking the predecessor rollback configuration. */
function reviewedPipelines(
  model: { hash: string; runtime: string },
  value: string,
  next: string | undefined,
): Array<{ hash: string; runtime: string }> {
  const hashes = value.split(',').map(fingerprint);
  if (!hashes.includes(model.hash)) {
    if (next === undefined || fingerprint(next) !== model.hash)
      throw new Error('Incomplete pipeline approvals.');
    hashes.push(model.hash);
  }
  const known = new Set([
    model.hash,
    '6ae4df3886df584b0d2de91d52febf0e3967851da628b6e6ef0d03a4669f7d74',
    '1271c7deba0443c4f53c76295c0789c9cdf766b53a5c9875ab560c2c5a7b7c58',
    '409455c7f259b71f0d9d2c60704613267da0c597f47c42b6ea92bbaf7f001a3f',
  ]);
  if (hashes.length > 4 || new Set(hashes).size !== hashes.length)
    throw new Error('Incomplete or duplicated pipeline approvals.');
  if (hashes.some((hash) => !known.has(hash)))
    throw new Error('Unreviewed inference predecessor.');
  return hashes.map((hash) => ({ hash, runtime: model.runtime }));
}

function inferenceSettings(input: {
  accepted: string | undefined;
  python: string | undefined;
  directory: string | undefined;
}): { accepted: string; python: string; directory: string } {
  const { accepted, python, directory } = input;
  if (
    !accepted ||
    !python ||
    !directory ||
    ![python, directory].every(isAbsolute)
  )
    throw new Error('Complete private inference configuration required.');
  return { accepted: fingerprint(accepted), python, directory };
}
