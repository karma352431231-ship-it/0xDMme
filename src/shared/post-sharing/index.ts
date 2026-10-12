import { keys, object } from '../account/index.ts';
import { communityBoolean } from '../communities/index.ts';
import { postCount } from '../community-posts/index.ts';
export interface PostShareState {
  shared: boolean;
  revision: number;
}
export function postShareState(value: unknown): PostShareState {
  const data = object(value);
  keys(data, ['shared', 'revision']);
  return {
    shared: communityBoolean(data['shared']),
    revision: postCount(data['revision']),
  };
}
