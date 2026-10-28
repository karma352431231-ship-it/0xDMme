import { t, translatedError } from '../../shared/i18n/index.ts';
import { ApiResponseError } from '../api-response/index.ts';
import {
  editPublicProfileHash,
  rememberProfileReturn,
} from '../profile-shortcut/index.ts';
import { communityElement as el } from './elements.ts';

function invitation(): HTMLElement {
  const notice = el('section', '', 'community-profile-invitation');
  notice.setAttribute('role', 'status');
  const heading = el('p');
  heading.append(el('strong', t('community.profile-invitation.title')));
  const link = el('a', t('community.profile-invitation.link'));
  link.href = editPublicProfileHash;
  rememberProfileReturn(link);
  notice.append(heading, link);
  return notice;
}

/** The mobile layout has no sidebar; keep its matching notice on the page. */
export function clearCommunityProfileInvitation(): void {
  const mobile = document.querySelector<HTMLElement>(
    '[data-community-profile-notice]',
  );
  if (!mobile) return;
  mobile.replaceChildren();
  mobile.hidden = true;
}

/** An expected prerequisite is an invitation, not a transport diagnostic. */
export function communityDirectoryProblem(
  container: HTMLElement,
  error: unknown,
): void {
  if (
    error instanceof ApiResponseError &&
    error.status === 403 &&
    error.failure === 'http' &&
    error.operation === 'communities/list' &&
    translatedError(error.reason) ===
      t('Create your public profile in Profile before participating.')
  ) {
    container.append(invitation());
    const mobile = document.querySelector<HTMLElement>(
      '[data-community-profile-notice]',
    );
    if (mobile) {
      mobile.replaceChildren(invitation());
      mobile.hidden = false;
    }
    return;
  }
  container.append(
    el(
      'p',
      error instanceof Error
        ? translatedError(error.message)
        : t('List unavailable.'),
    ),
  );
}
