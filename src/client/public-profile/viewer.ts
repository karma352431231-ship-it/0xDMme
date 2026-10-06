import { AccountError, object } from '../../shared/account/index.ts';
import {
  publicHandle,
  publicProfile,
} from '../../shared/public-profile/index.ts';

/** Public read sends no cookie, device proof or private profile information. */
export function showPublicProfile(
  container: HTMLElement,
  handle: unknown,
): () => void {
  const abort = new AbortController();
  container.innerHTML =
    '<article class="card public-profile-card"><h2>Perfil público</h2><div class="public-avatar-placeholder" aria-hidden="true">@</div><p data-public-handle></p><p role="status" data-public-status>Carregando perfil público…</p></article>';
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
      if (status)
        status.textContent =
          'Identidade pública do 0xDMme. Fotos públicas estarão disponíveis após a moderação automática.';
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
