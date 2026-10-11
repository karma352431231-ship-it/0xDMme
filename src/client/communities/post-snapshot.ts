import type {
  CommunityPost,
  PostPage,
} from '../../shared/community-posts/index.ts';
import type { FeedPage } from '../../shared/community-discovery/index.ts';

/** Retain only the currently rendered, validated and bounded public post/page.
 * Private post lists are always replaced; no network read is skipped. */
export class PostSnapshot {
  private identity = '';
  clear(): void {
    this.identity = '';
  }
  changed(query: string, value: CommunityPost | PostPage | FeedPage): boolean {
    const identity = JSON.stringify([query, value]);
    const changed = identity !== this.identity;
    this.identity = identity;
    return changed;
  }
}
