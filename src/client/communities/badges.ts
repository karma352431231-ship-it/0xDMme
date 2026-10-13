import { t } from '../../shared/i18n/index.ts';
import { keys, object } from '../../shared/account/index.ts';
import { communityArray } from '../../shared/communities/index.ts';
import { customBadge } from '../../shared/community-badges/index.ts';
import type { CommunityActions } from './actions.ts';
import {
  communityButton as button,
  communityCard as card,
  communityElement as el,
  communityField as field,
} from './elements.ts';
import { communityTargetPicker } from './target-picker.ts';

/** Badges are recognition; assigning one never calls the role operation. */
export function mountCommunityBadges(
  host: HTMLElement,
  id: string,
  actions: CommunityActions,
): void {
  const section = card(t('Badges personalizados'));
  host.append(section);
  section.append(
    el(
      'p',
      t(
        'Atribuição manual, sem poderes de gestão. Até 20 badges e três por pessoa.',
      ),
    ),
  );
  const label = field(section, t('Nome do badge (texto ou emoji)'), {
    maximum: 32,
  });
  const list = el('div');
  section.append(list);
  let createId = crypto.randomUUID();
  const load = async () => {
    const data = object(await actions.request('badge-list', { id }));
    keys(data, ['items']);
    list.replaceChildren();
    for (const raw of communityArray(data['items'])) {
      const badge = customBadge(raw),
        row = el('section', '', 'community-badge-editor');
      row.append(el('h3', badge.label));
      const name = field(row, t('Nome'), { maximum: 32, value: badge.label });
      button(row, t('Confirmar alterações'), () =>
        actions.query(async () => {
          await actions.request('badge-edit', {
            id,
            badge: badge.id,
            revision: badge.revision,
            label: name.value,
          });
          await load();
        }),
      );
      const target = communityTargetPicker(row, actions);
      for (const [enabled, title] of [
        [true, t('Atribuir badge')],
        [false, t('Remover badge do membro')],
      ] as const)
        button(row, title, () =>
          actions.query(async () => {
            await actions.request('badge-assign', {
              id,
              badge: badge.id,
              target: target().id,
              enabled,
            });
            feedback.textContent = t('Badge atualizado.');
          }),
        );
      const confirm = el('input');
      confirm.type = 'checkbox';
      const remove = el(
        'label',
        t('Excluir a definição deste badge quando não houver atribuições'),
      );
      remove.prepend(confirm);
      row.append(remove);
      button(row, t('Excluir badge'), () =>
        actions.query(async () => {
          if (!confirm.checked)
            throw new Error('Confirme a exclusão do badge.');
          await actions.request('badge-delete', {
            id,
            badge: badge.id,
            revision: badge.revision,
          });
          await load();
        }),
      );
      list.append(row);
    }
  };
  const feedback = el('p');
  feedback.setAttribute('role', 'status');
  section.append(feedback);
  button(section, t('Criar badge'), () =>
    actions.query(async () => {
      await actions.request('badge-create', {
        id,
        badge: createId,
        label: label.value,
      });
      createId = crypto.randomUUID();
      label.value = '';
      await load();
    }),
  );
  button(section, t('Carregar badges'), () => actions.query(load));
}
