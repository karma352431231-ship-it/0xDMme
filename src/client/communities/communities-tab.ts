import { appRoute } from '../../shared/app-routes/index.ts';
import { appAddress } from '../app-navigation/index.ts';

const communityPages = new Set(['communities', 'users']);
const feedHome = '#communities?view=feed';

function isFeedList(params: URLSearchParams): boolean {
  return (
    !params.has('id') &&
    !params.has('slug') &&
    !params.has('post') &&
    ['feed', 'following'].includes(params.get('view') ?? 'feed')
  );
}

function inCommunities(route: ReturnType<typeof appRoute>): boolean {
  return (
    route !== null &&
    communityPages.has(route.page) &&
    route.params.get('view') !== 'dms'
  );
}
function destination(state: {
  inside: boolean;
  left: string | null;
  address: string;
  route: ReturnType<typeof appRoute>;
  input: { feedReturn: () => string | null };
}): string {
  if (!state.inside) return state.left ?? feedHome;
  if (state.route?.page === 'communities' && isFeedList(state.route.params))
    return state.address;
  return state.input.feedReturn() ?? feedHome;
}

/**
 * The phone's Communities tab returns to where it was left: a profile, a
 * community or a post stay open across other tabs, and leaving them returns
 * to the feed position. Tapped while already inside, it goes one step toward
 * the feed. Only the link's destination is owned here, in memory, so a reload
 * starts from the feed as before. `feedReturn` is the kept way back, if any.
 */
export function startCommunitiesTab(input: {
  link: HTMLAnchorElement;
  feedReturn: () => string | null;
}): void {
  let left: string | null = null;
  let inside = false;
  function sync(): void {
    const address = appAddress(),
      route = appRoute(address);
    inside =
      inCommunities(route) &&
      // A profile opened from a chat or Activity belongs to that tab's visit.
      (route?.page === 'communities' || inside || address === left);
    if (inside) left = address;
    input.link.href = destination({ inside, left, address, route, input });
  }
  window.addEventListener('hashchange', sync);
  window.addEventListener('0xdmme-route-canonicalized', sync);
  sync();
}
