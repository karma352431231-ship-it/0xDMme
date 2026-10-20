import { appAddress, navigateApp } from '../app-navigation/index.ts';
import { appRoute } from '../../shared/app-routes/index.ts';

type Scope = 'private' | 'public';
interface ConversationState {
  conversationOpen?: boolean;
  contactScope?: Scope;
}
function state(): ConversationState {
  const value: unknown = history.state;
  return typeof value === 'object' && value !== null ? value : {};
}

/** A private chat is a history step, without putting its identity in the URL
 * or browser history. The selected conversation remains owned by Messages. */
export function startMobileConversation(options: {
  shell: HTMLElement;
  scope: (scope: Scope) => void;
  changed: () => void;
}) {
  const mobile = matchMedia('(max-width: 700px)');
  // Reloading has no selected private peer to restore. Never show an empty
  // full-screen chat just because the browser retained a presentation marker.
  if (mobile.matches && state().conversationOpen === true)
    history.replaceState({ ...state(), conversationOpen: false }, '');
  function restore(): void {
    if (!mobile.matches) return;
    const current = state(),
      open =
        appRoute(appAddress())?.page === 'chats' &&
        current.conversationOpen === true;
    if (
      current.contactScope &&
      current.contactScope !== options.shell.dataset['contactScope']
    )
      options.scope(current.contactScope);
    if (options.shell.dataset['chatOpen'] === String(open)) return;
    options.shell.dataset['chatOpen'] = String(open);
    options.changed();
  }
  options.shell
    .querySelectorAll<HTMLButtonElement>('[data-scope-choice]')
    .forEach((button) =>
      button.addEventListener('click', () => {
        const scope = button.dataset['scopeChoice'];
        if (scope === 'private' || scope === 'public')
          history.replaceState({ ...state(), contactScope: scope }, '');
      }),
    );
  return {
    restore,
    open(): void {
      if (!mobile.matches) return;
      const chats = appRoute(appAddress())?.page === 'chats';
      if (chats && state().conversationOpen === true) return;
      const next = {
        conversationOpen: true,
        contactScope: 'private',
      };
      if (chats) history.pushState({ ...state(), ...next }, '', appAddress());
      else navigateApp('#chats', next);
    },
    close(): boolean {
      if (!mobile.matches || state().conversationOpen !== true) return false;
      history.back();
      return true;
    },
  };
}
