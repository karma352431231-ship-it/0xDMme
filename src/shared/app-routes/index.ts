import { pathRoute, routePath } from './paths.ts';
export { reservedCommunitySlug } from './paths.ts';
/** Navigation only. Private identifiers, wallets, bearer tickets and contents
 * are never added to a route. Legacy fragments remain valid on old links. */
const aliases = {
  chats: 'chats',
  conversas: 'chats',
  communities: 'communities',
  comunidades: 'communities',
  users: 'users',
  publico: 'users',
  settings: 'settings',
  perfil: 'settings',
  configuracoes: 'settings',
  contacts: 'contacts',
  contatos: 'contacts',
  activity: 'activity',
  atividade: 'activity',
  vault: 'vault',
  cofre: 'vault',
  review: 'review',
  analise: 'review',
  status: 'status',
  split: 'split',
} as const;
export type AppRoutePage = (typeof aliases)[keyof typeof aliases];
export interface AppRoute {
  page: AppRoutePage;
  params: URLSearchParams;
}

export function appRoute(hash: string): AppRoute | null {
  if (hash.startsWith('/')) {
    const route = pathRoute(hash);
    return route && Object.hasOwn(aliases, route.page)
      ? {
          page: aliases[route.page as keyof typeof aliases],
          params: route.params,
        }
      : null;
  }
  const [path = '', query = ''] = hash.replace(/^#/u, '').split('?');
  if (!Object.hasOwn(aliases, path)) return null;
  const params = new URLSearchParams(query);
  if (params.has('secao') && !params.has('section'))
    params.set('section', params.get('secao')!);
  params.delete('secao');
  return { page: aliases[path as keyof typeof aliases], params };
}

export function appHref(
  page: AppRoutePage,
  params: URLSearchParams = new URLSearchParams(),
): string {
  return routePath(page, params);
}

/** Wallet and invitation fragments are parsed by their existing owners first. */
export function canonicalAppHash(hash: string): string | null {
  if (
    hash.startsWith('#configuracoes?') ||
    /^#(?:contatos|contacts)\?(?:convite|invite)=/u.test(hash)
  )
    return null;
  const route = appRoute(hash);
  return route ? appHref(route.page, route.params) : null;
}

export function routeParams(hash: string): URLSearchParams {
  return appRoute(hash)?.params ?? new URLSearchParams();
}

/** Push navigation admits only public community/post UUIDs, including old workers. */
export function publicPostHash(hash: string): string | null {
  const route = appRoute(hash);
  if (route?.page !== 'communities' || route.params.size !== 2) return null;
  const id = route.params.get('id'),
    post = route.params.get('post');
  const uuid = /^[a-f0-9-]{36}$/u;
  return id && post && uuid.test(id) && uuid.test(post)
    ? appHref('communities', new URLSearchParams({ id, post }))
    : null;
}

/** Only recognized public paths may receive the application shell. */
export function appDocumentPath(address: string): boolean {
  return address.startsWith('/') && appRoute(address) !== null;
}
export function communityHref(value: {
  id: string;
  slug?: string | null;
}): string {
  return appHref(
    'communities',
    new URLSearchParams(value.slug ? { slug: value.slug } : { id: value.id }),
  );
}
