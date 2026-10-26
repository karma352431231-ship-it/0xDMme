import type { PublicTrafficTarget } from '../../shared/engagement-metrics/index.ts';
import { publicVisitorMarker } from './marker.ts';
import { PublicObservationQueue } from './queue.ts';
import { publicTrafficTarget } from './route.ts';
import { uuid, object } from '../../shared/account/index.ts';
import { appAddress } from '../app-navigation/index.ts';

export { publicTrafficTarget } from './route.ts';
export { publicVisitorMarker } from './marker.ts';
export { PublicObservationQueue } from './queue.ts';
export { performPublicShare } from './actions.ts';

/** Own the observation lifetime separately from the application router's state. */
export function startPublicTraffic(host: HTMLElement): () => void {
  let leave: (() => void) | null = null;
  const routed = (): void => {
    leave?.();
    leave = observePublicPage(appAddress(), host);
  };
  const stop = (): void => {
    hidden();
    window.removeEventListener('hashchange', routed);
    window.removeEventListener('pagehide', hidden);
    window.removeEventListener('pageshow', routed);
  };
  const hidden = (): void => {
    leave?.();
    leave = null;
  };
  window.addEventListener('hashchange', routed);
  window.addEventListener('pagehide', hidden);
  window.addEventListener('pageshow', routed);
  routed();
  return stop;
}

/** Caller owns one page lifetime. No private navigation is retained or emitted. */
export function observePublicPage(hash: string, host: HTMLElement): () => void {
  let target = publicTrafficTarget(hash);
  if (!target) return () => {};
  const queue = new PublicObservationQueue();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let observed = false;
  function visible(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    if (
      observed ||
      document.visibilityState !== 'visible' ||
      !resolvedTarget(target)
    )
      return;
    timer = setTimeout(() => {
      timer = null;
      observed = true;
      let marker: string | null = null;
      try {
        marker = publicVisitorMarker(localStorage, Date.now());
      } catch {
        // Storage access itself can be unavailable; no fallback identity.
      }
      queue.observe({ ...target!, id: crypto.randomUUID(), kind: 'page' });
      if (marker) queue.visitor(marker);
    }, 1000);
  }
  visible();
  function communityReady(event: Event): void {
    if (!(event instanceof CustomEvent)) return;
    try {
      const data = object(event.detail as unknown);
      const community = uuid(data['community']);
      if (
        !target ||
        (target.community !== null && target.community !== community)
      )
        return;
      target = { ...target, community };
      visible();
    } catch {
      /* Only a validated public community can qualify its navigation. */
    }
  }
  host.addEventListener('0xdmme-public-community-ready', communityReady);
  document.addEventListener('visibilitychange', visible);
  return () => {
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', visible);
    host.removeEventListener('0xdmme-public-community-ready', communityReady);
    queue.close();
  };
}

function resolvedTarget(target: PublicTrafficTarget | null): boolean {
  if (!target) return false;
  return (
    !['community', 'post'].includes(target.category) ||
    target.community !== null
  );
}

/** The community owner publishes only its validated public identity after load. */
export function announcePublicCommunity(
  host: HTMLElement | null,
  community: string,
): void {
  const target = publicTrafficTarget(appAddress());
  if (!host || !target || !['community', 'post'].includes(target.category))
    return;
  host.dispatchEvent(
    new CustomEvent('0xdmme-public-community-ready', {
      detail: { community },
      bubbles: true,
    }),
  );
}

let actionQueue: PublicObservationQueue | null = null;
export function observePublicAction(
  target: PublicTrafficTarget,
  kind: 'share' | 'copy',
): void {
  if (!actionQueue) {
    const queue = new PublicObservationQueue();
    actionQueue = queue;
    window.addEventListener(
      'pagehide',
      () => {
        queue.close();
        if (actionQueue === queue) actionQueue = null;
      },
      { once: true },
    );
  }
  publicAction(actionQueue, target, kind);
}

/** A sharing owner disposes its own bounded queue with its controls. */
export function publicAction(
  queue: PublicObservationQueue,
  target: PublicTrafficTarget,
  kind: 'share' | 'copy',
): void {
  queue.observe({ ...target, kind, id: crypto.randomUUID() });
}
