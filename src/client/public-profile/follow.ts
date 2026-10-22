import { publicProfileGuidanceButton } from '../public-action-guidance/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { profileFollow } from '../../shared/profile-social/index.ts';
import type { ProfileFollow } from '../../shared/profile-social/index.ts';
import type { PublicProfiles } from './controller.ts';
import { editPublicProfileHash } from '../profile-shortcut/index.ts';

function link(host: HTMLElement, text: string, href: string): void {
  const node = document.createElement('a');
  node.textContent = text;
  node.href = href;
  host.append(node);
}

/**
 * Follow control shared by the profile page and its preview card. Visitors
 * without a session or public profile are pointed to Profile; the owner sees
 * the edit link instead.
 */
export async function followControl(
  host: HTMLElement,
  input: {
    controller: PublicProfiles | undefined;
    target: string;
    signal: AbortSignal;
    failed: (error: unknown) => void;
  },
): Promise<void> {
  const { controller, signal } = input;
  if (!controller?.hasSession()) {
    publicProfileGuidanceButton(host, 'follow-profile', signal);
    return;
  }
  if (!controller.profile) await controller.refresh();
  if (signal.aborted) return;
  if (!controller.profile) {
    publicProfileGuidanceButton(host, 'follow-profile', signal);
    return;
  }
  if (controller.profile.profile.id === input.target) {
    link(host, t('Edit public profile'), editPublicProfileHash);
    return;
  }
  let state: ProfileFollow = profileFollow(
    await controller.perform('follow-state', { target: input.target }),
  );
  if (signal.aborted) return;
  const button = document.createElement('button');
  button.type = 'button';
  const paint = (): void => {
    button.textContent = state.following ? t('follow.following') : t('Follow');
    button.setAttribute('aria-pressed', String(state.following));
  };
  button.addEventListener('click', () => {
    if (button.disabled) return;
    button.disabled = true;
    void controller
      .perform('follow', {
        target: input.target,
        following: !state.following,
        revision: state.revision,
      })
      .then((value) => {
        state = profileFollow(value);
        if (!signal.aborted) paint();
      })
      .catch(input.failed)
      .finally(() => {
        if (!signal.aborted) button.disabled = false;
      });
  });
  paint();
  host.append(button);
}
