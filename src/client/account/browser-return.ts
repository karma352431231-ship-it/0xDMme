import type { ReturnBrowser } from '../../shared/wallet-approval/index.ts';

/** A routing hint, never a browser inventory or authentication credential. */
export function originatingBrowser(): ReturnBrowser {
  const ua = navigator.userAgent;
  if (
    !/Android/iu.test(ua) ||
    !/Chrome\//u.test(ua) ||
    /EdgA\/|OPR\/|SamsungBrowser\/|Firefox\/|; wv\)/u.test(ua) ||
    window.matchMedia?.('(display-mode: standalone)').matches
  )
    return 'default';
  return 'chrome';
}

/** No ticket, signature, session or user-selected URL enters the return link. */
export function browserReturnUrl(browser: ReturnBrowser = 'default'): string {
  const target = new URL('/#configuracoes', location.origin);
  if (!/Android/iu.test(navigator.userAgent)) return target.href;
  // Chromium's parser strips this prefix and validates the literal HTTP(S) URL.
  // It does not percent-decode the entire target. No Android Intent parser needed.
  if (browser === 'chrome') return `googlechrome://navigate?url=${target.href}`;
  return browserReturnIntent();
}

export function browserReturnIntent(
  browser: ReturnBrowser = 'default',
): string {
  const target = new URL('/#configuracoes', location.origin);
  if (!/Android/iu.test(navigator.userAgent)) return target.href;
  // Keep exactly one #Intent delimiter: the route is only in the HTTPS fallback.
  const base = new URL('/', location.origin);
  const selected = browser === 'chrome' ? 'package=com.android.chrome;' : '';
  return `intent:${base.href.slice(base.protocol.length)}#Intent;scheme=${base.protocol.slice(0, -1)};${selected}action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(target.href)};end`;
}

export function attemptBrowserReturn(
  browser: ReturnBrowser = 'default',
): boolean {
  if (!/Android/iu.test(navigator.userAgent)) return false;
  try {
    location.assign(browserReturnUrl(browser));
    return true;
  } catch {
    // A user-gesture link remains available if this asynchronous attempt fails.
    return false;
  }
}
