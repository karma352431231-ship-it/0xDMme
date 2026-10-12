import type { PushPreferences } from '../../shared/daily/index.ts';

/**
 * Same-tab notice that the person changed a choice that follows the account
 * (docs/UI_CONFIGURACOES.md). Senders only describe the change; the account
 * copy in the encrypted vault is kept by account-settings.
 */
export interface PreferenceChange {
  theme?: string;
  sound?: boolean;
  externalMedia?: boolean;
  pushEnabled?: boolean;
  push?: PushPreferences;
}
const eventName = '0xdmme-account-preference';

export function announcePreference(change: PreferenceChange): void {
  // Tests and the standalone wallet document may run without a window.
  globalThis.window?.dispatchEvent(
    new CustomEvent<PreferenceChange>(eventName, { detail: change }),
  );
}

/** Listens for the page lifetime; account-settings is the only listener. */
export function onPreference(
  listener: (change: PreferenceChange) => void,
): void {
  globalThis.window?.addEventListener(eventName, (event) => {
    if (event instanceof CustomEvent)
      listener(event.detail as PreferenceChange);
  });
}
