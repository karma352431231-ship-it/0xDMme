import type { Community } from '../../shared/communities/index.ts';
import { communityElement as el, communityLink as link } from './elements.ts';
/** About projects the real recorded creation date and only owner-written rules. */
export function communityAbout(value: Community): HTMLElement {
  const rules = /^nenhuma?$/iu.test(value.rules.trim()) ? '' : value.rules;
  const info = el('details', '', 'community-info');
  info.append(
    el(
      'summary',
      rules ? 'Sobre e regras da comunidade' : 'Sobre a comunidade',
    ),
  );
  if (value.owner)
    link(
      info,
      `Proprietário: @${value.owner.handle}`,
      `#publico?handle=${encodeURIComponent(value.owner.handle)}`,
    );
  else info.append(el('p', 'Proprietário removido; comunidade arquivada.'));
  if (rules)
    info.append(
      el('h3', 'Regras da comunidade'),
      el('p', rules, 'community-text'),
    );
  return info;
}

export function communityCreationDate(value: Community): HTMLElement {
  const node = el('p', '', 'community-hero-meta');
  node.textContent = value.createdAt
    ? `Criada em ${new Date(value.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })}`
    : 'Data de criação não registrada';
  return node;
}
