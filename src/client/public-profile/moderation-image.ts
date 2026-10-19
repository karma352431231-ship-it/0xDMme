import { AccountError } from '../../shared/account/index.ts';
import { pendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import type { PublicModerationNotice } from '../../shared/public-moderation/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import type { PublicProfiles } from './controller.ts';

/** A full, uncropped image from the signed owner route, with no public URL or cache. */
export function showModerationImage(
  host: HTMLElement,
  notice: PublicModerationNotice,
  input: { controller: Pick<PublicProfiles, 'perform'>; signal: AbortSignal },
): void {
  const section = document.createElement('section');
  section.className = 'moderation-image';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  section.append(status);
  host.append(section);
  let url: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    if (url) URL.revokeObjectURL(url);
    url = null;
    clearTimeout(timer);
    section.replaceChildren(status);
  };
  const unavailable = () => {
    clear();
    status.textContent = t(
      'This file is no longer available. It may have been replaced, removed, or reached its retention deadline.',
    );
  };
  input.signal.addEventListener('abort', clear, { once: true });
  const remaining = Date.parse(notice.expiresAt) - Date.now();
  if (input.signal.aborted) return;
  if (
    ['discarding', 'removed', 'expired'].includes(notice.status) ||
    (notice.status !== 'approved' && remaining <= 0)
  ) {
    unavailable();
    return;
  }
  if (notice.status !== 'approved') timer = setTimeout(unavailable, remaining);
  async function load(): Promise<void> {
    status.textContent = t('Loading media…');
    try {
      const media = pendingPublicAvatar(
        await input.controller.perform('moderation-media', { id: notice.id }),
      );
      if (input.signal.aborted || !section.isConnected) return;
      if (
        notice.status !== 'approved' &&
        Date.parse(notice.expiresAt) <= Date.now()
      ) {
        unavailable();
        return;
      }
      if (!media) throw new Error('Preview unavailable.');
      const image = document.createElement('img');
      image.alt = t('Media restricted to your account');
      image.className = 'moderation-image-preview';
      url = URL.createObjectURL(new Blob([media.bytes], { type: media.type }));
      image.src = url;
      image.addEventListener('error', unavailable, { once: true });
      section.replaceChildren(image);
    } catch (error: unknown) {
      failure(error);
    }
  }
  function failure(error: unknown): void {
    if (input.signal.aborted || !section.isConnected) return;
    if (
      (error instanceof AccountError && error.status === 404) ||
      (notice.status !== 'approved' &&
        Date.parse(notice.expiresAt) <= Date.now())
    ) {
      unavailable();
      return;
    }
    status.textContent =
      error instanceof Error
        ? translatedError(error.message)
        : t('Preview unavailable.');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = t('Try again');
    retry.addEventListener('click', () => {
      retry.remove();
      void load();
    });
    section.append(retry);
  }
  void load();
}
