import { AccountError, object } from '../../shared/account/index.ts';
import {
  publicHandle,
  publicProfile,
} from '../../shared/public-profile/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';

function renderAvatar(
  container: HTMLElement,
  profile: PublicProfile,
  signal: AbortSignal,
): void {
  if (!profile.avatar) return;
  const placeholder = container.querySelector<HTMLElement>(
    '.public-avatar-placeholder',
  );
  if (!placeholder) return;
  placeholder.textContent = '';
  showPublicAvatar(placeholder, {
    kind: 'avatar',
    target: profile.id,
    reference: profile.avatar,
    signal,
  });
}

/** Public read sends no cookie, device proof or private profile information. */
export function showPublicProfile(
  container: HTMLElement,
  handle: unknown,
): () => void {
  const abort = new AbortController();
  container.innerHTML =
    '<article class="card public-profile-card"><h2>Perfil público</h2><div class="public-avatar-placeholder">@</div><p data-public-handle></p><p role="status" data-public-status>Carregando perfil público…</p></article>';
  const status = container.querySelector<HTMLElement>('[data-public-status]');
  async function load(): Promise<void> {
    try {
      const name = publicHandle(handle);
      const response = await fetch(
        `/api/public-profiles/${encodeURIComponent(name)}`,
        {
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]),
        },
      );
      const data: unknown = await response.json();
      if (!response.ok)
        throw new AccountError(
          response.status,
          String(object(data)['error']).slice(0, 200),
        );
      const profile = publicProfile(data);
      if (abort.signal.aborted) return;
      const label = container.querySelector('[data-public-handle]');
      if (label) label.textContent = `@${profile.handle}`;
      renderAvatar(container, profile, abort.signal);
      const dm = document.createElement('a');
      dm.textContent = 'Solicitar DM pelo @';
      dm.href = `#comunidades?view=dms&dm=${profile.id}`;
      container.querySelector('article')?.append(dm);
      if (status) status.textContent = 'Identidade pública do 0xDMme.';
    } catch (error: unknown) {
      if (!abort.signal.aborted && status)
        status.textContent =
          error instanceof Error
            ? error.message
            : 'Perfil público indisponível.';
    }
  }
  void load();
  return () => abort.abort();
}
