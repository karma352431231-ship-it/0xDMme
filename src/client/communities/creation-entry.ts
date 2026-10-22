import { appRoute } from '../../shared/app-routes/index.ts';
import { navigateApp } from '../app-navigation/index.ts';
import type { PublicActionAccess } from '../public-action-guidance/index.ts';

function plainClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
/** Visitors receive guidance without leaving the feed. Signed-in entries use
 * the creation screen's single prerequisite check before mounting any fields. */
export function bindCommunityCreationEntry(options: {
  access: PublicActionAccess;
  signal: () => AbortSignal;
  signedIn: () => boolean;
  failed: (error: unknown) => void;
}): void {
  document.addEventListener(
    'click',
    (event) => {
      if (
        options.signedIn() ||
        !(event.target instanceof Element) ||
        event.defaultPrevented
      )
        return;
      const link = event.target.closest<HTMLAnchorElement>('a[href]');
      if (!link || !plainClick(event)) return;
      const href = link.getAttribute('href') ?? '',
        route = appRoute(href);
      if (
        route?.page !== 'communities' ||
        route.params.get('view') !== 'create'
      )
        return;
      event.preventDefault();
      void options.access
        .allow('create-community', options.signal())
        .then((allowed) => {
          if (allowed) navigateApp(href);
        })
        .catch(options.failed);
    },
    { capture: true },
  );
}
