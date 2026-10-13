import { postBookmark } from './post-bookmark.ts';
import { keys, object } from '../../shared/account/index.ts';
import { publicBlockState } from '../../shared/profile-social/index.ts';
import type {
  CommunityPost,
  PostState,
} from '../../shared/community-posts/index.ts';
import type { Communities } from './controller.ts';
import {
  communityButton as button,
  communityElement as el,
} from './elements.ts';
import { communityIcon, iconLabel } from './presentation.ts';
import { togglePostPreference, togglePostVote } from './post-interactions.ts';
import { postReportForm } from './post-forms.ts';

interface Actions {
  saved?: boolean | undefined;
  controller: Communities;
  run: (work: () => Promise<void>) => Promise<void>;
  valid: () => boolean;
  changed: (state?: PostState) => Promise<void>;
  options?: (container: HTMLElement) => Promise<PostState | void>;
}
export function preferenceControls(
  container: HTMLElement,
  post: CommunityPost,
  actions: Actions,
): void {
  postBookmark(container, post, actions);
  const menu = el('details', '', 'post-more'),
    summary = el('summary', 'Mais opções da postagem'),
    content = el('div', '', 'post-more-content');
  iconLabel(summary, 'more');
  menu.append(summary, content);
  container.append(menu);
  const hide = button(content, 'Ocultar ou mostrar nos meus feeds', () =>
    actions.run(async () => {
      const value = await togglePostPreference(post, 'hidden', actions);
      if (value) await actions.changed();
    }),
  );
  iconLabel(hide, 'hide');
  if (post.status === 'visible') reportControl(content, post, actions);
  if (post.author) {
    const block = button(content, 'Bloquear usuário', () =>
      actions.run(async () => {
        const target = post.author!.id;
        const current = publicBlockState(
          await actions.controller.request('profile-block-state', { target }),
        );
        if (!actions.valid()) return;
        publicBlockState(
          await actions.controller.request('profile-block-set', {
            target,
            blocked: true,
            revision: current.revision,
          }),
        );
        if (!actions.valid()) return;
        window.dispatchEvent(
          new CustomEvent('0xdmme-public-block', {
            detail: { target, blocked: true },
          }),
        );
        await actions.changed();
      }),
    );
    block.dataset['postBlock'] = 'true';
    block.classList.add('post-menu-danger');
    iconLabel(block, 'block');
  }
  if (actions.options) {
    const management = el('div', '', 'post-options');
    content.append(management);
    let loaded = false;
    summary.addEventListener('click', () => {
      if (loaded || menu.open) return;
      void actions.run(async () => {
        const state = await actions.options?.(management);
        if (state?.own) {
          content
            .querySelector<HTMLElement>('[data-post-block]')
            ?.setAttribute('hidden', '');
          content
            .querySelector<HTMLElement>('.post-report')
            ?.setAttribute('hidden', '');
        }
        if (actions.valid()) loaded = true;
      });
    });
  }
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
      const result = object(
        await actions.controller.request('public-report', data),
      );
      keys(result, ['saved']);
      if (result['saved'] !== true) throw new Error('Denúncia não confirmada.');
      if (actions.valid())
        status.textContent = 'Denúncia guardada no backend do app.';
    }),
  );
}
export function postVoting(
  container: HTMLElement,
  post: CommunityPost,
  actions: (Actions & { position?: -1 | 0 | 1 | undefined }) | null,
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
            const state = await togglePostVote(post, position, actions);
            if (state && actions.valid()) await actions.changed(state);
          }),
        )
      : el('a');
    if (node instanceof HTMLAnchorElement) node.href = '#perfil';
    node.setAttribute(
      'aria-label',
      actions ? title : 'Entre pelo Perfil para votar',
    );
    node.dataset['vote'] = String(position);
    node.setAttribute('aria-pressed', String(actions?.position === position));
    node.append(communityIcon(icon));
    if (!actions) controls.append(node);
    if (position === 1)
      controls.append(el('span', String(post.score), 'post-score'));
  }
}
/** Compact menu for order/period choices; same values and validation as before. */
export function discoveryMenu(
  container: HTMLElement,
  label: string,
  selection: { value: string; options: readonly (readonly [string, string])[] },
  changed: (value: string) => void,
): HTMLDetailsElement {
  const menu = el('details', '', 'discovery-menu'),
    summary = el('summary'),
    value = el('span', '', 'discovery-menu-value'),
    options = el('div', '', 'discovery-menu-options');
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', label);
  summary.append(value);
  menu.append(summary, options);
  let current = selection.value;
  const show = () => {
    const title =
      selection.options.find(([key]) => key === current)?.[1] ?? current;
    value.textContent = title;
    summary.setAttribute('aria-label', `${label}: ${title}`);
    options.querySelectorAll('button').forEach((node) => {
      node.setAttribute('aria-pressed', String(node.value === current));
    });
  };
  for (const [key, title] of selection.options) {
    const option = el('button', title);
    option.type = 'button';
    option.value = key;
    option.addEventListener('click', () => {
      menu.open = false;
      if (key === current) return;
      current = key;
      show();
      changed(key);
    });
    options.append(option);
  }
  show();
  container.append(menu);
  return menu;
}
export const feedOrders = [
  ['mixed', 'Destaques'],
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
