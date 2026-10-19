import { t, currentLanguage } from '../../shared/i18n/index.ts';
import type { Community } from '../../shared/communities/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { communityElement as el } from './elements.ts';

/** The chooser and selected identity share the same public, moderated photo. */
export function composerCommunityIdentity(
  group: Community,
  signal: AbortSignal,
): HTMLElement {
  const identity = el('span', '', 'post-composer-identity');
  const avatar = el(
    'span',
    group.name.slice(0, 2).toUpperCase(),
    'post-composer-avatar',
  );
  avatar.setAttribute('aria-hidden', 'true');
  if (group.avatar) {
    avatar.textContent = '';
    showPublicAvatar(avatar, {
      kind: 'community-photo',
      target: group.id,
      reference: group.avatar,
      signal,
    });
  }
  const copy = el('span', '', 'post-composer-identity-copy');
  copy.append(
    el('strong', group.name),
    el(
      'small',
      group.archived
        ? t('Archived community')
        : t('{0} {1}', [
            group.followers.toLocaleString(currentLanguage()),
            group.followers === 1 ? t('follower') : t('followers'),
          ]),
    ),
  );
  identity.append(avatar, copy);
  return identity;
}
