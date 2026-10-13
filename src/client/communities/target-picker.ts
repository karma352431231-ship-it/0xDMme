import { t } from '../../shared/i18n/index.ts';
import { fetchApi, readApiJson } from '../api-response/index.ts';
import {
  publicHandle,
  publicProfile,
} from '../../shared/public-profile/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { CommunityActions } from './actions.ts';
import {
  communityField,
  communityElement,
  communityButton,
} from './elements.ts';
export function communityTargetPicker(
  container: HTMLElement,
  actions: CommunityActions,
): () => PublicProfile {
  const handle = communityField(container, t('@ do perfil público'), {
    maximum: 31,
  });
  const result = communityElement('p');
  container.append(result);
  let selected: PublicProfile | null = null;
  handle.addEventListener('input', () => {
    selected = null;
    result.textContent = '';
  });
  communityButton(container, t('Buscar perfil'), () =>
    actions.query(async () => {
      selected = null;
      const requested = handle.value;
      const response = await fetchApi(
        'public-profile/read',
        `/api/public-profiles/${encodeURIComponent(publicHandle(requested))}`,
        {
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
        },
      );
      const profile = publicProfile(
        await readApiJson(response, 'public-profile/read'),
      );
      if (handle.value !== requested) return;
      selected = profile;
      result.textContent = t(
        'Perfil selecionado: @{0}. Confira antes de confirmar.',
        [selected.handle],
      );
    }),
  );
  return () => {
    if (!selected)
      throw new Error('Busque e confira o perfil antes de continuar.');
    return selected;
  };
}
