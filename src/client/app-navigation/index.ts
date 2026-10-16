import {
  appRoute,
  appHref,
  canonicalAppHash,
} from '../../shared/app-routes/index.ts';

/** Private wallet/invitation fragments continue to be read by their own owners. */
export function appAddress(): string {
  return location.hash || (location.pathname ?? '/') + (location.search ?? '');
}
export function navigateApp(href: string): void {
  const target = canonicalAppHash(href);
  if (!target) {
    location.hash = href;
    return;
  }
  if (appAddress() === target) return;
  history.pushState(null, '', target);
  const targetWindow = window;
  queueMicrotask(() => targetWindow.dispatchEvent(new Event('hashchange')));
}
/** Normalize authored/legacy anchors as they mount, including copy and new-tab use. */
export function startAppNavigation(): void {
  const update = (link: HTMLAnchorElement): void => {
    const href = link.getAttribute('href') ?? '';
    if (!href.startsWith('#')) return;
    const canonical = canonicalAppHash(href);
    if (canonical && canonical !== href) link.setAttribute('href', canonical);
  };
  const scan = (node: Element): void => {
    if (node instanceof HTMLAnchorElement) update(node);
    node.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach(update);
  };
  scan(document.documentElement);
  new MutationObserver((records) => {
    for (const record of records) {
      if (
        record.type === 'attributes' &&
        record.target instanceof HTMLAnchorElement
      )
        update(record.target);
      for (const node of record.addedNodes)
        if (node instanceof Element) scan(node);
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['href'],
  });
  document.addEventListener('click', followAppLink);
  window.addEventListener('popstate', () =>
    window.dispatchEvent(new Event('hashchange')),
  );
}

function plainClick(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
function followAppLink(event: MouseEvent): void {
  if (!plainClick(event) || !(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>('a[href]');
  if (
    !link ||
    link.hasAttribute('download') ||
    (link.target && link.target !== '_self')
  )
    return;
  const href = link.getAttribute('href') ?? '';
  if (!appRoute(href) || !canonicalAppHash(href)) return;
  event.preventDefault();
  navigateApp(href);
}

export function replaceCommunityAddress(value: {
  id: string;
  slug?: string | null;
}): void {
  if (!value.slug) return;
  const route = appRoute(appAddress());
  if (
    !route ||
    !['communities', 'split'].includes(route.page) ||
    route.params.get('id') !== value.id
  )
    return;
  route.params.delete('id');
  route.params.set('slug', value.slug);
  history.replaceState(history.state, '', appHref(route.page, route.params));
}
