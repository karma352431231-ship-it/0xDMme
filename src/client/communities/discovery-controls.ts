import { postPreference } from '../../shared/community-discovery/index.ts';
import { postState } from '../../shared/community-posts/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import type { Communities } from './controller.ts';
import {
  communityButton as button,
  communityElement as el,
} from './elements.ts';

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
  const controls = el('div', '', 'post-toolbar');
  container.append(controls);
  button(controls, 'Salvar ou ocultar', () =>
    actions.run(async () => {
      if (!actions.valid()) return;
      let value = postPreference(
        await actions.controller.request('discovery-preference', {
          id: post.community,
          post: post.id,
        }),
      );
      if (!actions.valid()) return;
      function render(): void {
        controls.replaceChildren();
        for (const [key, label] of [
          ['saved', value.saved ? 'Remover dos salvos' : 'Salvar postagem'],
          [
            'hidden',
            value.hidden ? 'Voltar a mostrar' : 'Ocultar dos meus feeds',
          ],
        ] as const) {
          button(controls, label, () =>
            actions.run(async () => {
              if (!actions.valid()) return;
              const result = postPreference(
                await actions.controller.request('discovery-preference-set', {
                  id: post.community,
                  post: post.id,
                  preference: { ...value, [key]: !value[key] },
                }),
              );
              if (!actions.valid()) return;
              value = result;
              render();
              await actions.changed();
            }),
          );
        }
      }
      render();
    }),
  );
}
export function postVoting(
  container: HTMLElement,
  post: CommunityPost,
  actions: Actions,
): void {
  if (post.status !== 'visible') return;
  const controls = el('div', '', 'post-toolbar');
  container.append(controls);
  button(controls, 'Votar', () =>
    actions.run(async () => {
      if (!actions.valid()) return;
      const state = postState(
        await actions.controller.request('post-state', {
          id: post.community,
          post: post.id,
        }),
      );
      if (!actions.valid()) return;
      controls.replaceChildren(el('small', `Seu voto: ${state.vote.position}`));
      for (const [position, title] of [
        [1, 'Upvote'],
        [-1, 'Downvote'],
        [0, 'Retirar voto'],
      ] as const) {
        const node = button(controls, title, () =>
          actions.run(async () => {
            if (!actions.valid()) return;
            postState(
              await actions.controller.request('post-vote', {
                id: post.community,
                post: post.id,
                position,
                voteRevision: state.vote.revision,
              }),
            );
            if (actions.valid()) await actions.changed();
          }),
        );
        node.setAttribute(
          'aria-pressed',
          String(state.vote.position === position),
        );
      }
    }),
  );
}
export function discoverySelect(
  container: HTMLElement,
  label: string,
  selection: { value: string; options: readonly (readonly [string, string])[] },
  changed: (value: string) => void,
): HTMLSelectElement {
  const wrap = el('label', label),
    select = el('select');
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
