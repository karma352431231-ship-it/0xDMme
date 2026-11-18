import { t } from '../../shared/i18n/index.ts';

interface NavigationHistory {
  canGoBack?: boolean;
  addEventListener?: (type: 'currententrychange', listener: () => void) => void;
}

/** Whether this tab has an earlier screen of the app to return to. The
 * Navigation API only counts this site's own entries; where it is missing,
 * the history length is the closest signal. */
function canGoBack(): boolean {
  const navigation = (globalThis as { navigation?: NavigationHistory })
    .navigation;
  if (typeof navigation?.canGoBack === 'boolean') return navigation.canGoBack;
  return history.length > 1;
}

/**
 * The phone top bar's way back (owner, 18/11/2026): like a browser's back
 * button, it returns to the previous screen of the app, and it shows only when
 * there is one. Screens with their own back control (an open chat, a settings
 * category, a profile, a community, a post) hide this bar.
 */
export function startPhoneBack(bar: HTMLElement): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button phone-back';
  button.setAttribute('aria-label', t('Back'));
  button.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>';
  bar.prepend(button);
  const update = () => {
    button.hidden = !canGoBack();
  };
  button.addEventListener('click', () => {
    if (canGoBack()) history.back();
  });
  window.addEventListener('hashchange', update);
  window.addEventListener('popstate', update);
  (
    globalThis as { navigation?: NavigationHistory }
  ).navigation?.addEventListener?.('currententrychange', update);
  update();
}
