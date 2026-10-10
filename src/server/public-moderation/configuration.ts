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
  for (const name of files) {
    if (
      typeof name !== 'string' ||
      name.includes('..') ||
      !/^(infra\/public-moderation|src\/server\/public-moderation)\/[\w./-]+$/u.test(
        name,
      )
    )
      throw new Error('Invalid inference identity path.');
    const bytes = await readFile(new URL(name, project)),
      length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    digest.update(length).update(bytes);
  }
  return { hash: digest.digest('hex'), runtime };
}
/** The private operator's exact acceptance must match this authored pipeline; no upload flag selects it. */
export async function readPoseModerationConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<PoseModerationConfiguration | null> {
  const accepted = environment['HASH_TALK_MODERATION_ACCEPTED_HASH'],
    python = environment['HASH_TALK_MODERATION_PYTHON'],
    directory = environment['HASH_TALK_MODERATION_MODELS'];
  if (accepted === undefined && python === undefined && directory === undefined)
    return null;
  if (
    !accepted ||
    !python ||
    !directory ||
    ![python, directory].every(isAbsolute)
  )
    throw new Error('Complete private inference configuration required.');
  const model = await poseModelIdentity(),
    runtime = readMediaRuntime(environment);
  if (fingerprint(accepted) !== model.hash || !runtime)
    throw new Error('Inference acceptance or media runtime differs.');
  return { python, directory, runtime, model };
}
