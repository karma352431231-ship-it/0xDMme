import { t } from '../../shared/i18n/index.ts';
import { editPublicProfileHash } from '../profile-shortcut/index.ts';

export type PublicAction =
  'follow-community' | 'follow-profile' | 'post' | 'create-community';
const messages = {
  'follow-community': 'Create a public profile to follow this community.',
  'follow-profile': 'Create a public profile to follow this profile.',
  post: 'Create a public profile to publish a post.',
  'create-community': 'Create a public profile to create a community.',
} as const;
let closeCurrent: (() => void) | null = null;

export function closePublicProfileGuidance(): void {
  closeCurrent?.();
}

function element(tag: string, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

/** Used by direct creation URLs too, so closing the prompt leaves a useful page. */
export function mountPublicProfileInvitation(
  host: HTMLElement,
  action: PublicAction,
): void {
  const card = document.createElement('section');
  card.className = 'public-action-invitation';
  const link = document.createElement('a');
  link.className = 'primary public-action-settings';
  link.textContent = t('Create public profile');
  link.href = editPublicProfileHash;
  card.append(
    element('h2', t('A public profile is required')),
    element('p', t(messages[action])),
    element(
      'p',
      t('Open account settings to sign in and create your public profile.'),
    ),
    link,
  );
  host.append(card);
}

/** One native dialog, no private target data, listeners or queued action retained.
 * Nothing is followed/published automatically after account setup. */
export function showPublicProfileGuidance(action: PublicAction): void {
  closePublicProfileGuidance();
  const dialog = document.createElement('dialog');
  const lifetime = new AbortController(),
    signal = lifetime.signal;
  const previous = document.activeElement;
  dialog.className = 'public-action-dialog';
  dialog.setAttribute('aria-label', t('A public profile is required'));
  mountPublicProfileInvitation(dialog, action);
  const description = dialog.querySelector('p');
  if (description) {
    description.id = 'public-action-description';
    dialog.setAttribute('aria-describedby', description.id);
  }
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'public-action-dismiss';
  dismiss.textContent = t('Not now');
  dialog.append(dismiss);
  const close = () => {
    lifetime.abort();
    dialog.close();
    dialog.remove();
    if (closeCurrent === close) closeCurrent = null;
    if (previous instanceof HTMLElement && previous.isConnected)
      previous.focus();
  };
  closeCurrent = close;
  dismiss.addEventListener('click', close, { signal });
  dialog.addEventListener('close', close, { signal });
  dialog.addEventListener(
    'cancel',
    (event) => {
      event.preventDefault();
      close();
    },
    { signal },
  );
  dialog.querySelector('a')?.addEventListener('click', close, { signal });
  window.addEventListener('hashchange', close, { signal });
  window.addEventListener('popstate', close, { signal });
  window.addEventListener('pagehide', close, { signal });
  document.body.append(dialog);
  try {
    dialog.showModal();
  } catch (error: unknown) {
    close();
    throw error;
  }
}

/** The originating screen may disappear when a hover card opens the dialog.
 * Its signal guards the click, while navigation/account events own the dialog. */
export function publicProfileGuidanceButton(
  host: HTMLElement,
  action: PublicAction,
  signal: AbortSignal,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = t('Follow');
  button.setAttribute('aria-haspopup', 'dialog');
  button.addEventListener(
    'click',
    () => {
      if (!signal.aborted) showPublicProfileGuidance(action);
    },
    { signal },
  );
  host.append(button);
  return button;
}
