import { groupProfileDescription } from '../../shared/group-messages/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { object } from '../../shared/account/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { groupProfileHistory } from '../local-history/index.ts';
import { GroupCache } from './cache.ts';
/** A restored independent copy reads only its catalog's exact profile sequence. */
export async function cachedGroupDescription(
  authority: VaultAuthority,
  group: {
    state: { groupId: string };
    localOnly?: boolean;
    profileSequence?: number;
  },
): Promise<{ description: string; sequence: number }> {
  const cached = await new GroupCache(authority, group.state.groupId).get(
    'profile',
  );
  if (cached !== null)
    return {
      description: groupProfileDescription(cached) ?? '',
      sequence: integer(object(cached)['sequence'], Number.MAX_SAFE_INTEGER),
    };
  if (!group.localOnly || !group.profileSequence)
    return { description: '', sequence: 0 };
  const restored = await groupProfileHistory(
    authority,
    group.state.groupId,
    group.profileSequence,
  );
  return {
    description: restored
      ? (groupProfileDescription(JSON.parse(restored.text) as unknown) ?? '')
      : '',
    sequence: group.profileSequence,
  };
}
