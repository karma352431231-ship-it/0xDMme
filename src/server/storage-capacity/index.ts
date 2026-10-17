import type { ContentCapacity } from '../database/index.ts';
import type { WebConfiguration } from '../web-configuration/index.ts';
import { createPinnedVolume } from './volume.ts';
import { VolumeContentCapacity } from './policy.ts';
export { createPinnedVolume } from './volume.ts';
export type { VolumeFilesystem, VolumeReader } from './volume.ts';
export { VolumeContentCapacity } from './policy.ts';

export async function createRuntimeContentCapacity(
  config: WebConfiguration['contentCapacity'],
): Promise<ContentCapacity> {
  if (config.mode === 'fixed') return config.bytes;
  return new VolumeContentCapacity(
    await createPinnedVolume({ directory: config.directory }),
  );
}
