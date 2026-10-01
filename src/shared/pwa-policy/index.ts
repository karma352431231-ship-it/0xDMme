/** Public build assets only. Never cache API, query strings or authenticated data. */
export function cacheableRequest(
  request: Request,
  origin: string,
  assets: readonly string[],
): boolean {
  const url = new URL(request.url);
  return (
    request.method === 'GET' &&
    url.origin === origin &&
    url.search === '' &&
    url.pathname !== '/wallet.html' &&
    !request.headers.has('authorization') &&
    assets.includes(url.pathname)
  );
}
