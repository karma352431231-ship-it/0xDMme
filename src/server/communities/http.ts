import { accountRankingLookup } from './account-ranking.ts';
import type { AccountRankingPage } from '../../shared/account-ranking/index.ts';
import type { RankingPeriod } from '../../shared/community-ranking/index.ts';
import { communitySlug } from '../../shared/community-address/index.ts';
import { upvoterLookup } from './upvotes.ts';
import { directoryLookup } from './directory.ts';
import {
  communityFollowerTab,
  communityFollowers,
} from '../../shared/community-followers/index.ts';
import type { CommunityFollowerTab } from '../../shared/community-followers/index.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError, uuid } from '../../shared/account/index.ts';
import { community, communityCursor } from '../../shared/communities/index.ts';
import type {
  Community,
  CommunityPage,
} from '../../shared/communities/index.ts';
import { RequestBudget } from '../request-budget/index.ts';
import { discussionPage } from '../../shared/community-discussion/index.ts';
import type { DiscussionPage } from '../../shared/community-discussion/index.ts';
import { viewRequest } from './views.ts';
import { postViewsPage } from '../../shared/community-views/index.ts';
import {
  feedPage,
  explorePage,
  feedFilter,
  exploreFilter,
} from '../../shared/community-discovery/index.ts';
import type {
  FeedFilter,
  ExploreFilter,
  FeedPage,
  ExplorePage,
} from '../../shared/community-discovery/index.ts';
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

export function createCommunityHandler(read: {
  upvoters?: (
    id: string,
    post: string,
    after: string | null,
  ) => Promise<unknown>;
  followers?: (
    id: string,
    after: string | null,
    tab: CommunityFollowerTab,
  ) => Promise<unknown>;
  origin?: string;
  suggestions?: (query: string) => Promise<CommunityPage>;
  views?: (input: unknown) => Promise<unknown>;
  shareClicks?: (input: unknown) => Promise<{ accepted: true }>;
  accounts?: (
    period: RankingPeriod,
    after: string | null,
  ) => Promise<AccountRankingPage>;
  readAddress?: (slug: string) => Promise<Community>;
  read: (id: string) => Promise<Community>;
  list: (after: string | null) => Promise<CommunityPage>;
  feed?: (filter: FeedFilter, after: string | null) => Promise<FeedPage>;
  explore?: (
    filter: ExploreFilter,
    after: string | null,
  ) => Promise<ExplorePage>;
  post?: (community: string, id: string) => Promise<CommunityPost>;
  postPage?: (
    community: string,
    after: string | null,
    tag: string | null,
  ) => Promise<PostPage>;
  replies?: (
    community: string,
    parent: string,
    after: string | null,
  ) => Promise<PostPage>;
  discussion?: (
    community: string,
    parent: string,
    selection: { order: unknown; after: string | null },
  ) => Promise<DiscussionPage>;
  tags?: (community: string, after: string | null) => Promise<TagPage>;
}) {
  const budget = new RequestBudget();
  function send(
    response: ServerResponse,
    status: number,
    data: unknown,
    head: boolean,
  ): void {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.writeHead(status).end(head ? undefined : JSON.stringify(data));
  }
  async function lookup(request: IncomingMessage): Promise<unknown> {
    if (request.url === '/api/communities/share-clicks') {
      if (!read.shareClicks || !read.origin)
        throw new AccountError(404, 'Share counts unavailable.');
      budget.admit(request.socket.remoteAddress ?? 'unknown', false);
      return read.shareClicks(await viewRequest(request, read.origin));
    }
    if (request.url !== '/api/communities/views') return readLookup(request);
    if (!read.views || !read.origin)
      throw new AccountError(404, 'Views unavailable.');
    return {
      items: postViewsPage(
        await read.views(await viewRequest(request, read.origin)),
      ),
    };
  }
  async function followerLookup(address: URL): Promise<unknown> {
    if (!read.followers) throw new AccountError(404, 'Followers unavailable.');
    params(address, ['after', 'tab']);
    const id = uuid(address.pathname.split('/')[3]);
    return communityFollowers(
      await read.followers(
        id,
        communityCursor(address.searchParams.get('after')),
        communityFollowerTab(address.searchParams.get('tab') ?? 'all'),
      ),
    );
  }
  async function addressLookup(address: URL): Promise<Community | null> {
    if (
      !address.pathname.startsWith('/api/communities/address/') ||
      !read.readAddress ||
      address.search
    )
      return null;
    return community(
      await read.readAddress(
        communitySlug(
          decodeURIComponent(
            address.pathname.slice('/api/communities/address/'.length),
          ),
        ),
      ),
    );
  }
  async function publicDirectory(address: URL) {
    if (address.pathname === '/api/communities/accounts')
      return accountRankingLookup(address, read.accounts);
    return (await addressLookup(address)) ?? directoryLookup(address, read);
  }
  async function readLookup(request: IncomingMessage): Promise<unknown> {
    if (request.method !== 'GET' && request.method !== 'HEAD')
      throw new AccountError(405, 'Invalid method.');
    budget.admit(request.socket.remoteAddress ?? 'unknown', false, true);
    const address = new URL(request.url ?? '', 'http://local.invalid');
    if (
      ['/api/communities/feed', '/api/communities/explore'].includes(
        address.pathname,
      )
    )
      return discoveryLookup(address);
    if (
      /^\/api\/communities\/[a-f0-9-]{36}\/(?:posts|tags|followers)(?:\/|$)/u.test(
        address.pathname,
      )
    )
      return communitySubresource(address);
    const directory = await publicDirectory(address);
    if (directory) return directory;
    if (
      address.search ||
      !/^\/api\/communities\/[a-f0-9-]{36}$/u.test(address.pathname)
    )
      throw new AccountError(404, 'Community unavailable.');
    return community(
      await read.read(uuid(address.pathname.slice('/api/communities/'.length))),
    );
  }
  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const head = request.method === 'HEAD';
    try {
      send(response, 200, await lookup(request), head);
    } catch (error: unknown) {
      if (error instanceof AccountError && error.status === 405)
        response.setHeader(
          'Allow',
          (request.url === '/api/communities/views' && read.views) ||
            (request.url === '/api/communities/share-clicks' &&
              read.shareClicks)
            ? 'POST'
            : 'GET, HEAD',
        );
      send(
        response,
        error instanceof AccountError ? error.status : 503,
        {
          error:
            error instanceof AccountError
              ? error.message
              : 'Comunidade indisponível. Tente novamente.',
        },
        head,
      );
    }
  }
  function params(address: URL, allowed: string[]): void {
    if (
      [...address.searchParams.keys()].some(
        (key) =>
          !allowed.includes(key) ||
          address.searchParams.getAll(key).length !== 1,
      )
    )
      throw new AccountError(400, 'Invalid filters.');
  }
  async function discoveryLookup(address: URL): Promise<unknown> {
    const query = address.searchParams;
    if (address.pathname.endsWith('/feed') && read.feed) {
      params(address, ['order', 'period', 'community', 'tag', 'after']);
      return feedPage(
        await read.feed(
          feedFilter({
            scope: 'all',
            order: query.get('order') ?? 'mixed',
            period: query.get('period') ?? 'day',
            community: query.get('community'),
            tag: query.get('tag'),
          }),
          query.get('after'),
        ),
      );
    }
    if (address.pathname.endsWith('/explore') && read.explore) {
      params(address, ['order', 'period', 'topics', 'after']);
      return explorePage(
        await read.explore(
          exploreFilter({
            order: query.get('order') ?? 'trending',
            period: query.get('period') ?? 'day',
            topics: query.has('topics') ? query.get('topics')!.split(',') : [],
          }),
          query.get('after'),
        ),
      );
    }
    throw new AccountError(404, 'Discovery unavailable.');
  }
  function communitySubresource(address: URL): Promise<unknown> {
    if (address.pathname.endsWith('/upvoters'))
      return upvoterLookup(address, read.upvoters);
    return address.pathname.endsWith('/followers')
      ? followerLookup(address)
      : postLookup(address);
  }
  async function postLookup(address: URL): Promise<unknown> {
    const parts = address.pathname.split('/'),
      id = uuid(parts[3]);
    if (
      parts.length === 7 &&
      parts[4] === 'posts' &&
      parts[6] === 'replies' &&
      read.replies
    ) {
      return replyLookup(address, id, uuid(parts[5]));
    }
    if (parts.length === 5) return postList(address, id, parts[4]);
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
  ): Promise<unknown> {
    if (!read.replies) throw new AccountError(404, 'Replies unavailable.');
    if (address.searchParams.has('order') && read.discussion) {
      params(address, ['after', 'order']);
      return discussionPage(
        await read.discussion(id, parent, {
          order: address.searchParams.get('order'),
          after: address.searchParams.get('after'),
        }),
      );
    }
    params(address, ['after']);
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
  ): Promise<unknown> {
    if (kind === 'tags' && read.tags) {
      params(address, ['after']);
      return tagPage(
        await read.tags(id, communityCursor(address.searchParams.get('after'))),
      );
    }
    if (kind === 'posts' && read.postPage) {
      params(address, ['after', 'tag']);
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
  return { handle, close: () => budget.close() };
}
