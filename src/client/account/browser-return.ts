/** No ticket, signature, session or user-selected URL enters the return link. */
export function browserReturnUrl(): string {
  const target = new URL('/#configuracoes', location.origin);
  if (!/Android/iu.test(navigator.userAgent)) return target.href;
  // Resolve the default HTTPS browser, rather than inventing which browser
  // started the request. Authentication still requires its original cookie.
  return `intent:${target.href.slice(target.protocol.length)}#Intent;scheme=${target.protocol.slice(0, -1)};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(target.href)};end`;
}

export function attemptBrowserReturn(): boolean {
  if (!/Android/iu.test(navigator.userAgent)) return false;
  try {
    location.assign(browserReturnUrl());
    return true;
  } catch {
    // A user-gesture link remains available if this asynchronous attempt fails.
    return false;
  }
}
