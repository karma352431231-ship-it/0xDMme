import { t } from '../../shared/i18n/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import { avatarInitials, avatarTone } from '../appearance/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';

/** Public profiles only; this never reads a private contact or wallet. */
export function publicIdentityAvatar(
  profile: PublicProfile,
  signal: AbortSignal,
): HTMLAnchorElement {
  const avatar = document.createElement('a');
  avatar.className = 'public-identity-avatar conversation-avatar';
  avatar.href = `#publico?id=${profile.id}`;
  avatar.setAttribute(
    'aria-label',
    t('Abrir perfil de @{0}', [profile.handle]),
  );
  avatar.dataset['tone'] = avatarTone(profile.handle);
  const initial = document.createElement('span');
  initial.textContent = avatarInitials(profile.handle);
  avatar.append(initial);
  showIdentityPhoto(avatar, profile, signal);
  return avatar;
}

export function showIdentityPhoto(
  container: HTMLElement,
  profile: PublicProfile | null,
  signal: AbortSignal,
): () => void {
  if (!profile?.avatar) return () => undefined;
  return showPublicAvatar(container, {
    kind: 'avatar',
    target: profile.id,
    reference: profile.avatar,
    signal,
  });
}
