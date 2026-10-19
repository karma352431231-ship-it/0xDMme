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
  const section = card(t('Custom badges'));
  host.append(section);
  section.append(
    el(
      'p',
      t(
        'Manually assigned, without management powers. Up to 20 badges and three per person.',
      ),
    ),
  );
  const label = field(section, t('Badge name (text or emoji)'), {
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
      const name = field(row, t('Name'), { maximum: 32, value: badge.label });
      button(row, t('Confirm changes'), () =>
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
        [true, t('Assign badge')],
        [false, t('Remove badge from member')],
      ] as const)
        button(row, title, () =>
          actions.query(async () => {
            await actions.request('badge-assign', {
              id,
              badge: badge.id,
              target: target().id,
              enabled,
            });
            feedback.textContent = t('Badge updated.');
          }),
        );
      const confirm = el('input');
      confirm.type = 'checkbox';
      const remove = el(
        'label',
        t('Delete this badge definition when it has no assignments'),
      );
      remove.prepend(confirm);
      row.append(remove);
      button(row, t('Delete badge'), () =>
        actions.query(async () => {
          if (!confirm.checked) throw new Error('Confirm badge deletion.');
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
  button(section, t('Create badge'), () =>
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
  button(section, t('Load badges'), () => actions.query(load));
}
