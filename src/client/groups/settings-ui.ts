import { t } from '../../shared/i18n/index.ts';
import { paintAvatar } from '../appearance/index.ts';
import { chatIcon } from '../chat-ui/index.ts';
/** The chat keeps its selectors and authority; this module owns settings presentation. */
export const groupSettingsTemplate = t('html.6f2aac1c9ed0', [
  chatIcon('close'),
]);
export function bindGroupSettings(
  host: HTMLElement,
  lifecycle: { opened: () => void; closed: () => void },
): void {
  const dialog = host.querySelector<HTMLDialogElement>('[data-group-settings]');
  host
    .querySelector('[data-group-settings-open]')
    ?.addEventListener('click', () => {
      dialog?.showModal();
      lifecycle.opened();
    });
  dialog?.addEventListener('close', lifecycle.closed);
  host
    .querySelector('[data-group-settings-close]')
    ?.addEventListener('click', () => dialog?.close());
}
export function groupMemberActions(
  row: HTMLElement,
  name: string,
): HTMLElement {
  const menu = document.createElement('details'),
    trigger = document.createElement('summary'),
    actions = document.createElement('div');
  menu.className = 'group-member-menu';
  trigger.innerHTML = chatIcon('more');
  trigger.setAttribute('aria-label', t('Administrar {0}', [name]));
  actions.className = 'group-member-actions';
  actions.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('button'))
      menu.open = false;
  });
  row.append(menu);
  menu.append(trigger, actions);
  return actions;
}

export function updateGroupSettingsIdentity(
  host: HTMLElement | null,
  group: {
    title: string;
    state: { groupId: string; members: readonly unknown[] };
  },
): void {
  const title = host?.querySelector('[data-group-settings-title]'),
    count = host?.querySelector('[data-group-settings-count]'),
    avatar = host?.querySelector<HTMLElement>('[data-group-settings-avatar]');
  if (title) title.textContent = group.title;
  if (count)
    count.textContent = t('{0} participantes', [group.state.members.length]);
  if (avatar)
    paintAvatar(avatar, { label: group.title, seed: group.state.groupId });
}
