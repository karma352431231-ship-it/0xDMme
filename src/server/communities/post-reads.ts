import { AccountError, uuid } from '../../shared/account/index.ts';
import { communityCursor } from '../../shared/communities/index.ts';
import { discussionPage } from '../../shared/community-discussion/index.ts';
import type { DiscussionPage } from '../../shared/community-discussion/index.ts';
import {
  communityPost,
  postPage,
  postCursor,
  tagPage,
} from '../../shared/community-posts/index.ts';
import type {
  CommunityPost,
  PostPage,
  TagPage,
} from '../../shared/community-posts/index.ts';
import { requireCommunityParams } from './query-params.ts';

/** Only the capabilities needed by public post, reply and tag reads. */
export interface CommunityPostReads {
  post?:
    ((community: string, id: string) => Promise<CommunityPost>) | undefined;
  postPage?:
    | ((
        community: string,
        after: string | null,
        tag: string | null,
      ) => Promise<PostPage>)
    | undefined;
  replies?:
    | ((
        community: string,
        parent: string,
        after: string | null,
      ) => Promise<PostPage>)
    | undefined;
  discussion?:
    | ((
        community: string,
        parent: string,
        selection: { order: unknown; after: string | null; preview?: unknown },
      ) => Promise<DiscussionPage>)
    | undefined;
  tags?:
    ((community: string, after: string | null) => Promise<TagPage>) | undefined;
}

/** The general handler admits the request before delegating its URL here. */
export async function postReadLookup(
  address: URL,
  read: CommunityPostReads,
): Promise<unknown> {
  const parts = address.pathname.split('/'),
    id = uuid(parts[3]);
  if (
    parts.length === 7 &&
    parts[4] === 'posts' &&
    parts[6] === 'replies' &&
    read.replies
  ) {
    return replyLookup(address, id, uuid(parts[5]), read);
  }
  if (parts.length === 5) return postList(address, id, parts[4], read);
  if (
    parts[4] === 'posts' &&
    parts.length === 6 &&
    !address.search &&
    read.post
  )
    return communityPost(await read.post(id, uuid(parts[5])));
  throw new AccountError(404, 'Post unavailable.');
}
async function replyLookup(
  address: URL,
  id: string,
  parent: string,
  read: CommunityPostReads,
): Promise<unknown> {
  if (!read.replies) throw new AccountError(404, 'Replies unavailable.');
  if (address.searchParams.has('order') && read.discussion) {
    requireCommunityParams(address, ['after', 'order', 'preview']);
    return discussionPage(
      await read.discussion(id, parent, {
        order: address.searchParams.get('order'),
        preview: address.searchParams.get('preview') ?? undefined,
        after: address.searchParams.get('after'),
      }),
    );
  }
  requireCommunityParams(address, ['after']);
  return postPage(
    await read.replies(
      id,
      parent,
      postCursor(address.searchParams.get('after')),
    ),
  );
}
async function postList(
  address: URL,
  id: string,
  kind: string | undefined,
  read: CommunityPostReads,
): Promise<unknown> {
  if (kind === 'tags' && read.tags) {
    requireCommunityParams(address, ['after']);
    return tagPage(
      await read.tags(id, communityCursor(address.searchParams.get('after'))),
    );
  }
  if (kind === 'posts' && read.postPage) {
    requireCommunityParams(address, ['after', 'tag']);
    return postPage(
      await read.postPage(
        id,
        postCursor(address.searchParams.get('after')),
        communityCursor(address.searchParams.get('tag')),
      ),
    );
  }
  throw new AccountError(404, 'Post unavailable.');
}
