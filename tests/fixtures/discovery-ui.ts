import type { AccountRankingPage } from '../../src/shared/account-ranking/index.ts';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { startCommunityDiscovery } from '../../src/client/communities/discovery.ts';
import type { Communities } from '../../src/client/communities/controller.ts';
import type { AppLanguage } from '../../src/shared/i18n/index.ts';
import type {
  ExplorePage,
  FeedPage,
} from '../../src/shared/community-discovery/index.ts';
import type { PublicProfile } from '../../src/shared/public-profile/index.ts';
import { CommunityNode, communityDocument } from './community-dom.ts';

const bundle = await build({
  stdin: {
    contents: `export { startCommunityDiscovery } from './src/client/communities/discovery.ts';
      export { setActiveLanguage, t } from './src/shared/i18n/index.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'discoveryUi',
  // Search and byte loading have separate tests. Keep card controls, ranking,
  // response validation, pagination and the refresh pill real in this fixture.
  plugins: [
    {
      name: 'discovery-browser-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /\/ranking-live\.ts$/ }, () => ({
          path: 'ranking-live',
          namespace: 'fixture',
        }));
        builder.onResolve({ filter: /\/public-search\/index\.ts$/ }, () => ({
          path: 'search',
          namespace: 'fixture',
        }));
        builder.onResolve(
          { filter: /\/public-media\/index\.ts$/ },
          ({ importer }) =>
            importer.includes('/src/client/')
              ? { path: 'media', namespace: 'fixture' }
              : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents:
            path === 'ranking-live'
              ? 'export function watchRankingUpdates(options) { fixtureRanking(options); }'
              : path === 'search'
                ? 'export function mountPublicSearchToolbar() {}'
                : `export function showPublicAvatar(host, input) { return fixtureMedia(host, input.signal); }
                 export function showPublicPostMedia(host, media, signal) { return fixtureMedia(host, signal); }
                 export function publicAvatarBlob() { throw new Error('Unexpected byte read'); }
                 export function publicPostMediaBlob() { throw new Error('Unexpected byte read'); }`,
          loader: 'js',
        }));
      },
    },
  ],
  define: {
    'import.meta.url': '"https://0xdmme.app/fixture.js"',
    EMOJI_ASSET_URL: '"/unused"',
    ATTACHMENT_WORKER_URL: '"/unused"',
  },
});
const source = bundle.outputFiles[0]?.text ?? '';
assert.ok(source);

class DiscoveryNode extends CommunityNode {
  scrollTop = 0;
  clientHeight = 600;
  override classList = {
    add: (...names: string[]) => {
      this.className = [
        ...new Set([...this.className.split(' '), ...names]),
      ].join(' ');
    },
    toggle: (name: string, force: boolean) => {
      const names = new Set(this.className.split(' ').filter(Boolean));
      if (force) names.add(name);
      else names.delete(name);
      this.className = [...names].join(' ');
    },
  };
  get isConnected(): boolean {
    if (this.tag === '#document') return true;
    let node = this.parent;
    while (node) {
      if (node.tag === '#document') return true;
      node = node.parent;
    }
    return false;
  }
  before(node: CommunityNode): void {
    if (!this.parent) return;
    node.remove();
    const index = this.parent.children.indexOf(this);
    node.parent = this.parent;
    this.parent.children.splice(index, 0, node);
  }
  scrollTo(options: { top: number }): void {
    this.scrollTop = options.top;
  }
  getBoundingClientRect(): { top: number; bottom: number } {
    return { top: 0, bottom: this.clientHeight };
  }
  focus(): void {}
}

export const groupId = crypto.randomUUID();
export const author: PublicProfile = {
  id: crypto.randomUUID(),
  handle: 'synthetic_author',
  avatar: null,
};
export function feed(): FeedPage {
  return {
    items: [
      {
        community: { id: groupId, name: 'Untranslated community' },
        post: {
          id: crypto.randomUUID(),
          community: groupId,
          author,
          title: 'Untranslated title',
          text: 'Untranslated content',
          tags: [],
          createdAt: '2026-10-15T12:00:00.000Z',
          editedAt: null,
          revision: 1,
          status: 'visible',
          parent: null,
          root: null,
          score: 5,
          replies: 2,
          views: 0,
        },
        viewerVote: 1,
        viewerSaved: true,
        viewerShared: true,
      },
    ],
    next: null,
  };
}
export function ranking(): ExplorePage {
  return {
    items: [
      {
        community: {
          id: groupId,
          name: 'Untranslated community',
          description: 'Untranslated description',
          rules: '',
          revision: 1,
          archived: false,
          avatar: null,
          owner: null,
          followers: 1234,
        },
        activity: 10,
        participants: 8,
        previousParticipants: 4,
        upvotes: 6,
        historyComplete: true,
      },
    ],
    generation: crypto.randomUUID(),
    cutoff: '2026-10-15T12:00:00.000Z',
    expiresAt: '2026-10-15T12:05:00.000Z',
    next: null,
  };
}

interface FixtureOptions {
  view?: string;
  language?: AppLanguage;
  signedIn?: boolean;
}
export function discoveryFixture(options: FixtureOptions = {}) {
  const document = communityDocument();
  document.createElement = (tag: string) => new DiscoveryNode(tag);
  document.createElementNS = (_namespace: string, tag: string) =>
    new DiscoveryNode(tag);
  const host = new DiscoveryNode('main');
  document.append(document.body);
  document.body.append(host);
  const requests: { after: string | null; order: string }[] = [];
  const intervals = new Map<number, () => void>();
  const media = new Map<CommunityNode, AbortSignal>();
  const rankingUpdates: {
    refresh: () => Promise<void>;
    signal: AbortSignal;
  }[] = [];
  let intervalId = 0;
  const state = {
    feed: feed(),
    ranking: ranking(),
    accounts: {
      generation: crypto.randomUUID(),
      cutoff: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      next: null,
      items: [
        {
          profile: author,
          description: 'Synthetic bio',
          followers: 1500,
          score: 3_000_000,
          previousScore: 1_000_000,
          views: 1200,
          upvotes: 23,
          comments: 7,
          shares: 4,
        },
      ],
    } as AccountRankingPage,
    accountReply: null as (() => Promise<unknown>) | null,
    accountRequests: [] as URL[],
    reply: null as (() => Promise<unknown>) | null,
    operations: [] as string[],
    request: null as Communities['request'] | null,
  };
  const read = (after: string | null, order: string) => {
    requests.push({ after, order });
    return state.reply
      ? state.reply()
      : Promise.resolve(
          options.view === 'explore' ? state.ranking : state.feed,
        );
  };
  const controller = {
    request: (operation: string, data: Record<string, unknown>) => {
      state.operations.push(operation);
      if (operation !== 'discovery-feed') {
        assert.ok(state.request, 'Unexpected operation: ' + operation);
        return state.request(operation, data);
      }
      const filter = data['filter'] as { order: string };
      return read(data['after'] as string | null, filter.order);
    },
  };
  const context: Record<string, unknown> = {
    document,
    window: new EventTarget(),
    HTMLElement: CommunityNode,
    HTMLAnchorElement: class {},
    HTMLButtonElement: CommunityNode,
    HTMLInputElement: CommunityNode,
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    Response,
    TextEncoder,
    TextDecoder,
    Error,
    Event,
    CustomEvent,
    crypto,
    performance,
    setTimeout,
    clearTimeout,
    setInterval: (work: () => void, delay: number) => {
      assert.equal(delay, 45_000);
      intervals.set(++intervalId, work);
      return intervalId;
    },
    clearInterval: (id: number) => intervals.delete(id),
    requestAnimationFrame: (work: FrameRequestCallback) => work(0),
    getComputedStyle: () => ({ overflowY: 'auto' }),
    matchMedia: () => ({ matches: false }),
    fetch: async (input: string) => {
      const url = new URL(input, 'https://0xdmme.app');
      if (url.pathname === '/api/communities/accounts') {
        state.accountRequests.push(url);
        return Response.json(
          state.accountReply ? await state.accountReply() : state.accounts,
        );
      }
      return Response.json(
        await read(
          url.searchParams.get('after'),
          url.searchParams.get('order')!,
        ),
      );
    },
    fixtureMedia: (node: CommunityNode, signal: AbortSignal) => {
      media.set(node, signal);
      return () => media.delete(node);
    },
    fixtureRanking: (options: {
      enabled: boolean;
      refresh: () => Promise<void>;
      signal: AbortSignal;
    }) => {
      if (options.enabled) rankingUpdates.push(options);
    },
  };
  runInNewContext(source, context);
  const exported = context['discoveryUi'] as {
    startCommunityDiscovery: typeof startCommunityDiscovery;
    setActiveLanguage: (language: AppLanguage) => void;
    t: (source: string) => string;
  };
  exported.setActiveLanguage(options.language ?? 'en');
  const ui = exported.startCommunityDiscovery(
    controller as unknown as Communities,
    {} as Parameters<typeof startCommunityDiscovery>[1],
    {
      inspect: () => Promise.resolve(null),
      set: () =>
        Promise.resolve({ following: false, notify: false, revision: 0 }),
    },
  );
  const mount = () => {
    host.replaceChildren();
    ui.mount(host as unknown as HTMLElement, {
      view: options.view ?? 'feed',
      signedIn: options.signedIn ?? false,
    });
  };
  mount();
  return {
    ui,
    host,
    state,
    requests,
    intervals,
    media,
    published: () =>
      Promise.all(
        rankingUpdates
          .filter((entry) => !entry.signal.aborted)
          .map((entry) => entry.refresh()),
      ),
    mount,
    t: exported.t,
    scroll(top: number) {
      host.scrollTop = top;
      document.dispatchEvent(new Event('scroll'));
    },
  };
}

export async function settled(
  fixture: ReturnType<typeof discoveryFixture>,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    await setImmediate();
    if (fixture.ui.canActivate()) return;
  }
  assert.fail('Discovery did not settle: ' + fixture.host.textContent);
}

export function button(host: CommunityNode, label: string): CommunityNode {
  const node = host
    .querySelectorAll('button')
    .find((item) => item.textContent === label);
  assert.ok(node, 'Missing button: ' + label);
  return node;
}
