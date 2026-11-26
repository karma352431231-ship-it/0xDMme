import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { communityElement as el } from './elements.ts';

/**
 * A post's net score. It is plain text: the whole vote pill upvotes and
 * the score no longer opens a list of voters (owner, 26/11/2026).
 */
export function postScore(post: CommunityPost): HTMLSpanElement {
  return el('span', String(post.score), 'post-score');
}
