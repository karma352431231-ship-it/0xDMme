import { communityState } from '../../shared/communities/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import type { Communities } from './controller.ts';
import {
  communityButton as button,
  communityElement as el,
} from './elements.ts';
import { communityIcon, iconLabel } from './presentation.ts';
import { togglePostPreference, togglePostVote } from './post-interactions.ts';
import { postReportForm } from './post-forms.ts';

interface Actions {
  controller: Communities;
  run: (work: () => Promise<void>) => Promise<void>;
  valid: () => boolean;
  changed: () => Promise<void>;
}
export function preferenceControls(
  container: HTMLElement,
  post: CommunityPost,
  actions: Actions,
): void {
  const save = button(container, 'Salvar', () =>
    actions.run(async () => {
      const value = await togglePostPreference(post, 'saved', actions);
      if (!value) return;
      save.replaceChildren(
        communityIcon('bookmark'),
        el('span', value.saved ? 'Salvo' : 'Salvar', 'post-action-caption'),
      );
      save.setAttribute('aria-pressed', String(value.saved));
      save.setAttribute(
        'aria-label',
        value.saved ? 'Remover postagem dos salvos' : 'Salvar postagem',
      );
    }),
  );
  save.className = 'post-action post-save';
  save.setAttribute('aria-label', 'Salvar ou remover postagem dos salvos');
  save.replaceChildren(
    communityIcon('bookmark'),
    el('span', 'Salvar', 'post-action-caption'),
  );
  const menu = el('details', '', 'post-more'),
    summary = el('summary', 'Mais opções da postagem'),
    content = el('div', '', 'post-more-content');
  iconLabel(summary, 'more');
  menu.append(summary, content);
  container.append(menu);
  button(content, 'Ocultar ou voltar a mostrar nos meus feeds', () =>
    actions.run(async () => {
      const value = await togglePostPreference(post, 'hidden', actions);
      if (value) await actions.changed();
    }),
  );
  if (post.status === 'visible') reportControl(content, post, actions);
}
function reportControl(
  container: HTMLElement,
  post: CommunityPost,
  actions: Actions,
): void {
  const form = el('details', '', 'post-report'),
    summary = el('summary', 'Denunciar');
  iconLabel(summary, 'flag');
  form.append(summary);
  container.append(form);
  const status = el('p');
  status.setAttribute('role', 'status');
  form.append(status);
  postReportForm(form, post, (data) =>
    actions.run(async () => {
      if (!actions.valid()) return;
      communityState(await actions.controller.request('report', data));
      if (actions.valid())
        status.textContent = 'Denúncia enviada à moderação da comunidade.';
    }),
  );
}
export function postVoting(
  container: HTMLElement,
  post: CommunityPost,
  actions: Actions | null,
): void {
  if (post.status !== 'visible') return;
  const controls = el('div', '', 'post-votes');
  controls.setAttribute('aria-label', 'Votos da postagem');
  container.append(controls);
  for (const [position, title, icon] of [
    [1, 'Votar a favor; tocar novamente retira o voto', 'up'],
    [-1, 'Votar contra; tocar novamente retira o voto', 'down'],
  ] as const) {
    const node = actions
      ? button(controls, '', () =>
          actions.run(async () => {
            await togglePostVote(post, position, actions);
            if (actions.valid()) await actions.changed();
          }),
        )
      : el('a');
    if (node instanceof HTMLAnchorElement) node.href = '#perfil';
    node.setAttribute(
      'aria-label',
      actions ? title : 'Entre pelo Perfil para votar',
    );
    node.append(communityIcon(icon));
    if (!actions) controls.append(node);
    if (position === 1)
      controls.append(el('span', String(post.score), 'post-score'));
  }
}
export function discoverySelect(
  container: HTMLElement,
  label: string,
  selection: { value: string; options: readonly (readonly [string, string])[] },
  changed: (value: string) => void,
): HTMLSelectElement {
  const wrap = el('label', label),
    select = el('select');
  select.setAttribute('aria-label', label);
  for (const [key, title] of selection.options) {
    const option = el('option', title);
    option.value = key;
    select.append(option);
  }
  select.value = selection.value;
  select.addEventListener('change', () => changed(select.value));
  wrap.append(select);
  container.append(wrap);
  return select;
}
export const feedOrders = [
  ['recent', 'Recentes'],
  ['votes', 'Mais votados'],
  ['replies', 'Mais comentados'],
] as const;
export const discoveryPeriods = [
  ['day', '24 horas'],
  ['week', '7 dias'],
  ['month', '30 dias'],
  ['all', 'Todo o histórico'],
] as const;
