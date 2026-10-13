import { paintAvatar } from '../appearance/index.ts';
import { chatIcon } from '../chat-ui/index.ts';
/** The chat keeps its selectors and authority; this module owns settings presentation. */
export const groupSettingsTemplate = `<dialog data-group-settings class="group-dialog group-settings" aria-label="Configurações do grupo"><header><div><span class="group-eyebrow">GRUPO PRIVADO</span><h2>Configurações do grupo</h2></div><button data-group-settings-close class="group-close" type="button" aria-label="Fechar configurações">${chatIcon('close')}</button></header><div class="group-settings-identity"><button data-group-settings-avatar data-group-photo class="group-person-avatar group-photo-trigger" type="button" aria-label="Alterar foto do grupo" title="Alterar foto do grupo"></button><div><strong data-group-settings-title></strong><p data-group-settings-count></p></div></div><section class="group-members-section"><div class="group-section-heading"><h3>Participantes</h3><button data-group-manage class="group-primary" type="button">Adicionar</button></div><ul data-group-members class="group-people-list"></ul></section><details data-group-vault class="group-vault"><summary>Cofre do grupo<span aria-hidden="true">⌄</span></summary><div class="group-vault-body"><p data-group-usage></p><p data-group-cleanup-warning role="status"></p><ul data-group-cleanup-items></ul><button data-group-cleanup-more type="button" hidden>Próximas mídias selecionadas</button><p><a href="#cofre">Salvar um backup cifrado</a> para conservar uma cópia das mídias antes da limpeza. Status não entra no backup.</p><button data-group-clear class="group-danger" type="button">Limpar cofre remoto</button></div></details><footer class="group-settings-footer"><p data-group-owner-note class="group-hint">Para sair, ofereça a propriedade a outro membro e aguarde o aceite.</p><div class="group-button-row"><button data-group-leave class="group-danger" type="button">Sair do grupo</button><button data-group-delete class="group-danger" type="button">Excluir grupo</button></div></footer><p data-group-settings-notice role="status" class="group-feedback"></p></dialog>`;
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
  trigger.setAttribute('aria-label', `Administrar ${name}`);
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
  if (count) count.textContent = `${group.state.members.length} participantes`;
  if (avatar)
    paintAvatar(avatar, { label: group.title, seed: group.state.groupId });
}
