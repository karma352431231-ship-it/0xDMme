import { appHref, appRoute } from '../../shared/app-routes/index.ts';

export const panelLayouts = ['all', 'nochat', 'solo'] as const;
export type PanelLayout = (typeof panelLayouts)[number];
export type CommunityTarget =
  | { kind: 'dm'; id: string | null; local: boolean }
  | { kind: 'feed'; params: URLSearchParams }
  | { kind: 'profile'; handle: string };
export interface PublicChatTarget {
  id: string | null;
  local: boolean;
}

/** Modified link clicks retain the browser's new-tab/window behavior. */
export function isPlainNavigationClick(
  event: Pick<
    MouseEvent,
    'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'
  >,
): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function communityTarget(href: string): CommunityTarget | null {
  const route = appRoute(href);
  if (route?.page === 'users') {
    const handle = route.params.get('id') ?? route.params.get('handle');
    return handle ? { kind: 'profile', handle } : null;
  }
  if (route?.page !== 'communities') return null;
  if (route.params.get('view') === 'dms')
    return {
      kind: 'dm',
      id: route.params.get('dm'),
      local: route.params.get('history') === 'local',
    };
  return { kind: 'feed', params: route.params };
}

export function splitTarget(hash: string): {
  layout: PanelLayout;
  target: CommunityTarget;
  dm: PublicChatTarget | null;
} | null {
  const route = appRoute(hash);
  if (
    !route ||
    (route.page !== 'split' &&
      !(route.page === 'chats' && route.params.get('layout') === 'chat'))
  )
    return null;
  const params = new URLSearchParams(route.params);
  const layout =
    route.page === 'chats'
      ? 'solo'
      : params.get('layout') === 'feed'
        ? 'nochat'
        : 'all';
  const dm = params.has('dm')
    ? { id: params.get('dm') || null, local: params.get('history') === 'local' }
    : null;
  params.delete('layout');
  params.delete('dm');
  params.delete('history');
  const profile = params.get('profile');
  params.delete('profile');
  return {
    layout,
    target: profile
      ? { kind: 'profile', handle: profile }
      : { kind: 'feed', params },
    dm,
  };
}

/** Only public panel targets enter the URL; the private conversation stays local. */
export function splitHref(input: {
  layout: PanelLayout;
  target: CommunityTarget;
  dm: PublicChatTarget | null;
}): string {
  const params =
    input.target.kind === 'feed'
      ? new URLSearchParams(input.target.params)
      : new URLSearchParams();
  params.set(
    'layout',
    input.layout === 'solo'
      ? 'chat'
      : input.layout === 'nochat'
        ? 'feed'
        : 'split',
  );
  if (input.target.kind === 'profile')
    params.set('profile', input.target.handle);
  if (input.dm) {
    params.set('dm', input.dm.id ?? '');
    if (input.dm.local) params.set('history', 'local');
  }
  return appHref(input.layout === 'solo' ? 'chats' : 'split', params);
}

/** Layout changes alone keep the already mounted public content. */
export function samePanelTarget(
  a: CommunityTarget,
  b: CommunityTarget,
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'profile' && b.kind === 'profile')
    return a.handle === b.handle;
  if (a.kind === 'feed' && b.kind === 'feed') {
    const left = new URLSearchParams(a.params),
      right = new URLSearchParams(b.params);
    left.sort();
    right.sort();
    return left.toString() === right.toString();
  }
  return (
    a.kind === 'dm' && b.kind === 'dm' && a.id === b.id && a.local === b.local
  );
}

export function standalonePanelHref(
  hash: string,
  wide: boolean,
  split: boolean,
): string | null {
  const route = splitTarget(hash);
  if (!route || wide) return null;
  if (route.dm) return split ? null : publicDmHref(route.dm);
  if (route.layout === 'solo') return null;
  if (route.target.kind === 'profile')
    return appHref(
      'users',
      new URLSearchParams({
        [/^[a-f0-9-]{36}$/u.test(route.target.handle) ? 'id' : 'handle']:
          route.target.handle,
      }),
    );
  return route.target.kind === 'feed'
    ? appHref('communities', route.target.params)
    : null;
}

function publicDmHref(dm: PublicChatTarget): string {
  return appHref(
    'communities',
    new URLSearchParams({
      view: 'dms',
      ...(dm.id ? { dm: dm.id } : {}),
      ...(dm.local ? { history: 'local' } : {}),
    }),
  );
}
