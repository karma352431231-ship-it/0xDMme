import { t, currentLanguage } from '../../shared/i18n/index.ts';
import type { Community } from '../../shared/communities/index.ts';
import { communityElement as el } from './elements.ts';
/** About projects the real recorded creation date and only owner-written rules. */
export function communityAbout(value: Community): HTMLElement | null {
  const rules = /^nenhuma?$/iu.test(value.rules.trim()) ? '' : value.rules;
  if (!rules) return null;
  const info = el('details', '', 'community-info');
  info.append(
    el('summary', t('Sobre e regras da comunidade')),
    el('h3', t('Regras da comunidade')),
    el('p', rules, 'community-text'),
  );
  return info;
}

export function communityCreationDate(value: Community): HTMLElement {
  const node = el('p', '', 'community-hero-meta');
  node.textContent = value.createdAt
    ? t('Criada em {0}', [
        new Date(value.createdAt).toLocaleDateString(currentLanguage(), {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'UTC',
        }),
      ])
    : t('Data de criação não registrada');
  return node;
}
