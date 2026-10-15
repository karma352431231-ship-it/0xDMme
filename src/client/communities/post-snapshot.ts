import type {
  CommunityPost,
  PostPage,
} from '../../shared/community-posts/index.ts';
import { editedPost } from './post-edit-update.ts';
import type {
  FeedEntry,
  FeedPage,
} from '../../shared/community-discovery/index.ts';

/** Retain only the currently rendered, validated and bounded public post/page.
 * Private post lists are always replaced; no network read is skipped. */
export class PostSnapshot {
  private identity = '';
  private current: {
    query: string;
    value:
      | CommunityPost
      | { items: (CommunityPost | FeedEntry)[]; next: string | null };
  } | null = null;
  clear(): void {
    this.identity = '';
    this.current = null;
  }
  changed(query: string, value: CommunityPost | PostPage | FeedPage): boolean {
    const identity = JSON.stringify([query, value]);
    const changed = identity !== this.identity;
    this.identity = identity;
    this.current = { query, value };
    return changed;
  }
  accept(post: CommunityPost): void {
    if (!this.current) return;
    const { query, value } = this.current;
    const next =
      'items' in value
        ? {
            ...value,
            items: value.items.map((item) =>
              'post' in item
                ? { ...item, post: editedPost(item.post, post) }
                : editedPost(item, post),
            ),
          }
        : editedPost(value, post);
    this.current = { query, value: next };
    this.identity = JSON.stringify([query, next]);
  }
}
