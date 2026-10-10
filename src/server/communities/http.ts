import type { IncomingMessage, ServerResponse } from 'node:http';
import { AccountError, uuid } from '../../shared/account/index.ts';
import {
  community,
  communityCursor,
  communityPage,
} from '../../shared/communities/index.ts';
import type {
  Community,
  CommunityPage,
} from '../../shared/communities/index.ts';
import { RequestBudget } from '../request-budget/index.ts';
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
  origin?: string;
  views?: (input: unknown) => Promise<unknown>;
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
  tags?: (community: string, after: string | null) => Promise<TagPage>;
}) {
  const budget = new RequestBudget();
  let active = 0;
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
    if (request.url !== '/api/communities/views') return readLookup(request);
    if (!read.views || !read.origin)
      throw new AccountError(404, 'Visualizações indisponíveis.');
    return {
      items: postViewsPage(
        await read.views(await viewRequest(request, read.origin)),
      ),
    };
  }
  async function readLookup(request: IncomingMessage): Promise<unknown> {
    if (request.method !== 'GET' && request.method !== 'HEAD')
      throw new AccountError(405, 'Método inválido.');
    budget.admit(request.socket.remoteAddress ?? 'unknown', false, true);
    const address = new URL(request.url ?? '', 'http://local.invalid');
    if (
      ['/api/communities/feed', '/api/communities/explore'].includes(
        address.pathname,
      )
    )
      return discoveryLookup(address);
    if (
      /^\/api\/communities\/[a-f0-9-]{36}\/(?:posts|tags)(?:\/|$)/u.test(
        address.pathname,
      )
    )
      return postLookup(address);
    if (address.pathname === '/api/communities') {
      params(address, ['after']);
      return communityPage(
        await read.list(communityCursor(address.searchParams.get('after'))),
      );
    }
    if (
      address.search ||
      !/^\/api\/communities\/[a-f0-9-]{36}$/u.test(address.pathname)
    )
      throw new AccountError(404, 'Comunidade indisponível.');
    return community(
      await read.read(uuid(address.pathname.slice('/api/communities/'.length))),
    );
  }
  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const head = request.method === 'HEAD';
    if (active >= 4) {
      send(response, 503, { error: 'Comunidades ocupadas. Aguarde.' }, head);
      return;
    }
    active++;
    try {
      send(response, 200, await lookup(request), head);
    } catch (error: unknown) {
      if (error instanceof AccountError && error.status === 405)
        response.setHeader(
          'Allow',
          request.url === '/api/communities/views' && read.views
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
    } finally {
      active--;
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
      throw new AccountError(400, 'Filtros inválidos.');
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
            period: query.get('period') ?? 'all',
            community: query.get('community'),
            tag: query.get('tag'),
          }),
          query.get('after'),
        ),
      );
    }
    if (address.pathname.endsWith('/explore') && read.explore) {
      params(address, ['order', 'period', 'after']);
      return explorePage(
        await read.explore(
          exploreFilter({
            order: query.get('order') ?? 'trending',
            period: query.get('period') ?? 'day',
          }),
          query.get('after'),
        ),
      );
    }
    throw new AccountError(404, 'Descoberta indisponível.');
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
      params(address, ['after']);
      return postPage(
        await read.replies(
          id,
          uuid(parts[5]),
          postCursor(address.searchParams.get('after')),
        ),
      );
    }
    if (parts.length === 5) return postList(address, id, parts[4]);
    if (
      parts[4] === 'posts' &&
      parts.length === 6 &&
      !address.search &&
      read.post
    )
      return communityPost(await read.post(id, uuid(parts[5])));
    throw new AccountError(404, 'Post indisponível.');
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
    throw new AccountError(404, 'Post indisponível.');
  }
  return { handle, close: () => budget.close() };
}
