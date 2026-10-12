import { keys, object } from '../account/index.ts';
import { communityBoolean } from '../communities/index.ts';
import { postCount } from '../community-posts/index.ts';
export interface PublicBlockState {
  blocked: boolean;
  revision: number;
}
export function publicBlockState(value: unknown): PublicBlockState {
  const data = object(value);
  keys(data, ['blocked', 'revision']);
  return {
    blocked: communityBoolean(data['blocked']),
    revision: postCount(data['revision']),
  };
}
export interface ProfileNotifications {
  enabled: boolean;
  revision: number;
}
export function profileNotifications(value: unknown): ProfileNotifications {
  const data = object(value);
  keys(data, ['enabled', 'revision']);
  return {
    enabled: communityBoolean(data['enabled']),
    revision: postCount(data['revision']),
  };
}
