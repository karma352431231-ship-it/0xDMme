import { uuid } from '../../shared/account/index.ts';
import { appRoute } from '../../shared/app-routes/index.ts';
import type { PublicTrafficTarget } from '../../shared/engagement-metrics/index.ts';

/** Inspect an allowlist only; private fragments never become observations. */
export function publicTrafficTarget(hash: string): PublicTrafficTarget | null {
  const route = appRoute(hash);
  if (route?.page === 'users')
    return { category: 'profile', community: null, post: null };
  if (!route || !['communities', 'split'].includes(route.page)) return null;
  const params = route.params;
  if (route.page === 'split' && params.has('profile'))
    return { category: 'profile', community: null, post: null };
  const view = params.get('view') ?? 'feed';
  if (!['feed', 'explore', 'communities'].includes(view)) return null;
  return communityTarget(params, view);
}

function communityTarget(
  params: URLSearchParams,
  view: string,
): PublicTrafficTarget | null {
  try {
    const community = params.has('id') ? uuid(params.get('id')) : null;
    const post = params.has('post') ? uuid(params.get('post')) : null;
    if (post && !community && !params.has('slug')) return null;
    return {
      category: category(params, { community, post }, view),
      community,
      post,
    };
  } catch {
    return null;
  }
}

function category(
  params: URLSearchParams,
  target: { community: string | null; post: string | null },
  view: string,
): PublicTrafficTarget['category'] {
  if (target.post) return 'post';
  if (target.community || params.has('slug')) return 'community';
  return view === 'feed' ? 'feed' : 'directory';
}
