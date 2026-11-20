import { AccountError, keys, object } from '../account/index.ts';
import {
  communityArray,
  communityBoolean,
  communityCursor,
} from '../communities/index.ts';
import { publicProfile } from '../public-profile/index.ts';
import type { PublicProfile } from '../public-profile/index.ts';

/** One profile's mute of another: hides posts, replies and notices for it only. */
export interface ProfileMuteState {
  muted: boolean;
  revision: number;
}
/** A page of the Mute and block lists, ordered by profile id. */
export interface SafetyProfilePage {
  items: PublicProfile[];
  next: string | null;
}

export function profileMuteState(value: unknown): ProfileMuteState {
  const data = object(value);
  keys(data, ['muted', 'revision']);
  const revision = data['revision'];
  if (
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  )
    throw new AccountError(400, 'Invalid mute revision.');
  return { muted: communityBoolean(data['muted']), revision };
}

export function safetyProfilePage(value: unknown): SafetyProfilePage {
  const data = object(value);
  keys(data, ['items', 'next']);
  return {
    items: communityArray(data['items']).map(publicProfile),
    next: communityCursor(data['next']),
  };
}
