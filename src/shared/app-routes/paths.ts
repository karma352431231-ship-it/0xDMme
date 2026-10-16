/** Public navigation paths. Unconsumed filters keep their existing query contract. */
const views = new Set([
  'feed',
  'following',
  'explore',
  'communities',
  'saved',
  'hidden',
  'replies',
  'invitations',
  'create',
  'dms',
]);
function take(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  params.delete(key);
  return value;
}
function communityPath(params: URLSearchParams): string {
  const slug = take(params, 'slug'),
    id = take(params, 'id');
  let path = slug
    ? `/${encodeURIComponent(slug)}`
    : id
      ? `/id/${encodeURIComponent(id)}`
      : '';
  const post = take(params, 'post');
  if (post && path) path += `/posts/${encodeURIComponent(post)}`;
  else if (post) params.set('post', post);
  const view = params.get('view');
  if (!path && view && views.has(view)) path = `/${take(params, 'view')!}`;
  return path;
}
export function routePath(page: string, input: URLSearchParams): string {
  const params = new URLSearchParams(input);
  let path = `/${page}`;
  if (page === 'users') {
    const key = params.has('handle') ? 'handle' : 'id';
    const value = take(params, key);
    if (value) path += `/${key}/${encodeURIComponent(value)}`;
  } else if (page === 'settings' && params.has('section')) {
    path += `/${encodeURIComponent(take(params, 'section')!)}`;
  } else if (page === 'communities') path += communityPath(params);
  else if (page === 'split') path += splitPath(params);
  const query = params.toString();
  return path + (query ? '?' + query : '');
}
function splitPath(params: URLSearchParams): string {
  if (params.get('layout') === 'split') params.delete('layout');
  const profile = take(params, 'profile');
  if (profile) return `/profile/${encodeURIComponent(profile)}`;
  if (params.has('id') || params.has('slug'))
    return '/communities' + communityPath(params);
  const view = take(params, 'view');
  return `/${encodeURIComponent(view ?? 'feed')}`;
}
export function pathRoute(
  address: string,
): { page: string; params: URLSearchParams } | null {
  const [pathname = '', query = ''] = address.split('?');
  let parts: string[];
  try {
    parts = pathname.slice(1).split('/').map(decodeURIComponent);
  } catch {
    return null;
  }
  if (
    parts.some(
      (part) => /[/?#\\\p{Cc}]/u.test(part) || part === '.' || part === '..',
    )
  )
    return null;
  const page = parts.shift() ?? '',
    params = new URLSearchParams(query);
  if (!readPath(page, parts, params)) return null;
  return { page, params };
}
function readPath(
  page: string,
  parts: string[],
  params: URLSearchParams,
): boolean {
  if (!parts.length) return true;
  if (page === 'communities') return readCommunityPath(parts, params);
  if (page === 'split') return readSplitPath(parts, params);
  if (page === 'settings' && parts.length === 1) {
    params.set('section', parts[0]!);
    return true;
  }
  if (
    page === 'users' &&
    parts.length === 2 &&
    ['id', 'handle'].includes(parts[0]!)
  ) {
    params.set(parts[0]!, parts[1]!);
    return true;
  }
  return false;
}
function readSplitPath(parts: string[], params: URLSearchParams): boolean {
  if (parts[0] === 'communities')
    return readCommunityPath(parts.slice(1), params);
  if (parts[0] === 'profile' && parts.length === 2) {
    params.set('profile', parts[1]!);
    return true;
  }
  if (parts.length === 1 && views.has(parts[0]!)) {
    params.set('view', parts[0]!);
    return true;
  }
  return false;
}
function readCommunityPath(parts: string[], params: URLSearchParams): boolean {
  if (parts.length === 1 && views.has(parts[0]!)) {
    params.set('view', parts[0]!);
    return true;
  }
  const length = parts[0] === 'id' ? 2 : 1;
  if (!parts[length - 1]) return false;
  if (
    parts.length !== length &&
    !(parts.length === length + 2 && parts[length] === 'posts')
  )
    return false;
  params.set(length === 2 ? 'id' : 'slug', parts[length - 1]!);
  if (parts.length > length) params.set('post', parts[length + 1]!);
  return true;
}
export function reservedCommunitySlug(value: string): boolean {
  return views.has(value) || value === 'id';
}
