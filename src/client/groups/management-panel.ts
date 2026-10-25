import { t } from '../../shared/i18n/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import { groupManager } from '../../shared/groups/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { paintAvatar } from '../appearance/index.ts';
import { withMenuIcon } from '../menu-icons/index.ts';
import type { GroupController, GroupSummary } from './controller.ts';
import { GroupPhotoUi, GroupPhotoView } from './photo-ui.ts';
import { GroupDescriptionUi } from './description-ui.ts';
import type { GroupMemberPresentation } from './member-presentation.ts';
import type { GroupProfile } from './people.ts';
import { GroupActionsUi, showGroupManagement } from './actions-ui.ts';
import { chooseGroupSuccessor } from './owner-handover.ts';
import {
  groupSettingsTemplate,
  bindGroupSettings,
  groupMemberActions,
  updateGroupSettingsIdentity,
} from './settings-ui.ts';

interface ManagementOptions {
  access: VaultAccess;
  controller: Pick<
    GroupController,
    | 'selected'
    | 'photo'
    | 'updatePhoto'
    | 'description'
    | 'updateDescription'
    | 'change'
    | 'create'
    | 'admission'
    | 'incoming'
    | 'incomingNext'
    | 'respond'
    | 'entries'
    | 'refreshIncoming'
    | 'mode'
    | 'creationPending'
    | 'cancelCreation'
  >;
  account: () => string | undefined;
  members: Pick<
    GroupMemberPresentation,
    | 'name'
    | 'identity'
    | 'clearPanel'
    | 'clearConversation'
    | 'contactCandidate'
    | 'offerContact'
  >;
  peers: () => readonly Peer[];
  profile: GroupProfile;
  refresh: () => Promise<void>;
  open: (group: GroupSummary | string) => Promise<void>;
  isBusy: () => boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  /** Dialogs retain their existing local feedback instead of the chat runner. */
  dialogRun: (work: () => Promise<void>) => Promise<void>;
  report: (notice: string) => void;
  render: () => void;
}
/** Owns settings/profile resources, role controls and admission presentation.
 * The controller remains the authority for membership and consent operations. */
export class GroupManagementPanel {
  private readonly options: ManagementOptions;
  private host: HTMLElement | null = null;
  private aside: HTMLElement | null = null;
  private displayedGroup: string | null = null;
  private readonly photoView = new GroupPhotoView();
  private readonly photoUi: GroupPhotoUi;
  private readonly descriptionUi: GroupDescriptionUi;
  private readonly actions: GroupActionsUi;
  constructor(options: ManagementOptions) {
    this.options = options;
    this.photoUi = new GroupPhotoUi({
      selected: () => options.controller.selected,
      account: () => options.account(),
      load: () => options.controller.photo(),
      run: options.dialogRun,
      save: async (input) => {
        await options.controller.updatePhoto(input);
        await options.refresh();
      },
    });
    this.descriptionUi = new GroupDescriptionUi({
      selected: () => options.controller.selected,
      account: () => options.account(),
      load: () => options.controller.description(),
      save: (input) => options.controller.updateDescription(input),
      run: options.run,
    });
    this.actions = new GroupActionsUi({
      access: options.access,
      controller: options.controller,
      peers: options.peers,
      profile: options.profile,
      refresh: options.refresh,
      open: (id) => options.open(id),
      isBusy: options.isBusy,
      run: options.dialogRun,
    });
  }
  create(): void {
    this.actions.showCreate();
  }
  join(url: string): void {
    this.actions.showJoin(url);
  }
  setSession(value: AccountSession | null): void {
    this.actions.setSession(value);
  }
  closeSettings(): void {
    this.node<HTMLDialogElement>('[data-group-settings]')?.close();
    this.options.members.clearPanel();
  }
  deselected(): void {
    this.descriptionUi.reset();
  }
  leave(): void {
    this.closeSettings();
    this.options.members.clearConversation();
    this.photoView.reset();
    this.photoUi.reset();
    this.descriptionUi.reset();
    this.actions.reset();
  }
  clearSession(): void {
    this.closeSettings();
    this.options.members.clearConversation();
    this.photoView.reset();
    this.photoUi.reset();
  }
  clearAdmission(): void {
    this.actions.reset();
  }
  mount(host: HTMLElement, aside: HTMLElement): void {
    this.host = host;
    this.aside = aside;
    aside.innerHTML = t('html.8694eeb2078e');
    host.insertAdjacentHTML('beforeend', groupSettingsTemplate);
    host
      .querySelectorAll('[data-group-photo]')
      .forEach((node) =>
        node.addEventListener('click', () => this.photoUi.open()),
      );
    this.descriptionUi.mount(host);
    bindGroupSettings(host, {
      opened: () => {
        this.renderMembers();
        if (this.options.controller.selected)
          this.descriptionUi.show(this.options.controller.selected);
      },
      closed: () => this.options.members.clearPanel(),
    });
    this.bind();
  }
  private bind(): void {
    this.node('[data-group-manage]')?.addEventListener('click', () =>
      this.actions.showManage(),
    );
    this.bindAside();
    this.bindMembership();
  }
  private bindMembership(): void {
    this.node('[data-group-leave]')?.addEventListener(
      'click',
      () =>
        void this.options.run(async () => {
          const account = this.options.account();
          if (!account || !(await this.confirmLeave(account))) return;
          await this.options.controller.change({
            kind: 'leave',
            target: account,
          });
          await this.options.refresh();
          this.options.render();
        }),
    );
    this.node('[data-group-delete]')?.addEventListener(
      'click',
      () =>
        void this.options.run(async () => {
          if (
            !window.confirm(
              t(
                'Delete the group and start removing the remote vault for everyone? Copies already kept by participants remain under their control.',
              ),
            )
          )
            return;
          await this.options.controller.change({
            kind: 'delete',
            target: null,
          });
          await this.options.refresh();
          this.options.render();
        }),
    );
  }
  private node<T extends HTMLElement>(selector: string): T | null {
    return this.host?.querySelector<T>(selector) ?? null;
  }
  private sidebar<T extends HTMLElement>(selector: string): T | null {
    return this.aside?.querySelector<T>(selector) ?? null;
  }
  updateSettingsGroup(group: GroupSummary | null): void {
    if (this.displayedGroup !== (group?.state.groupId ?? null)) {
      this.node<HTMLDialogElement>('[data-group-settings]')?.close();
      this.options.members.clearPanel();
      this.options.members.clearConversation();
      this.photoView.reset();
      this.photoUi.reset();
      this.descriptionUi.reset();
      this.displayedGroup = group?.state.groupId ?? null;
    }
    if (!group) return;
    updateGroupSettingsIdentity(this.host, group);
    if (this.node<HTMLDialogElement>('[data-group-settings]')?.open)
      this.descriptionUi.show(group);
  }
  renderIdentity(group: GroupSummary): void {
    const heading = this.node('[data-group-title]');
    if (heading) heading.textContent = group.title;
    const avatar = this.node('[data-group-avatar]');
    if (avatar)
      paintAvatar(avatar, { label: group.title, seed: group.state.groupId });
    const count = this.node('[data-group-count]');
    if (count)
      count.textContent = group.localOnly
        ? t('Independent local copy · this copy grants no remote access')
        : t('{0} participants', [group.state.members.length]);
    this.renderGroupPhoto(group);
    this.renderLocalControls(group);
  }
  private renderGroupPhoto(group: GroupSummary): void {
    const account = this.options.account();
    const targets = [
      ...(this.host?.querySelectorAll<HTMLElement>('[data-group-photo]') ?? []),
    ];
    const allowed =
      !group.localOnly && !!account && groupManager(group.state, account);
    for (const node of targets) {
      if (node instanceof HTMLButtonElement) node.disabled = !allowed;
      node.setAttribute(
        'aria-label',
        allowed ? t('Change group photo') : t('Group photo'),
      );
      node.title = allowed ? t('Change group photo') : t('Group photo');
    }
    this.photoView.show(
      JSON.stringify([
        group.state.groupId,
        group.head,
        group.profileSequence ?? 0,
      ]),
      targets,
      () => this.options.controller.photo(),
    );
  }
  /** A member confirms; the owner first hands ownership to the member they
   * pick, signed by the owner alone, and leaves as a regular member. If the
   * departure then fails, the handover stands and Leave can be retried. */
  private async confirmLeave(account: string): Promise<boolean> {
    const group = this.options.controller.selected;
    if (!group || group.state.owner !== account)
      return window.confirm(
        t('Leave the group? You will lose access to the remote vault.'),
      );
    const settings = this.node('[data-group-settings]');
    if (!settings) return false;
    const successor = await chooseGroupSuccessor({
      host: settings,
      owner: account,
      members: group.state.members,
      name: (member) => this.options.members.name(member),
    });
    if (!successor) return false;
    await this.options.controller.change({
      kind: 'transfer',
      target: successor,
    });
    return true;
  }
  private renderLocalControls(group: GroupSummary): void {
    for (const selector of [
      '[data-group-leave]',
      '[data-group-owner-note]',
      '[data-group-delete]',
      '[data-group-clear]',
    ]) {
      const control = this.node(selector);
      if (control) control.hidden = !!group.localOnly;
    }
  }
  private button(label: string, work: () => Promise<void>): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => void this.options.run(work));
    return b;
  }
  renderMembers(): void {
    const account = this.options.account();
    const list = this.node('[data-group-members]'),
      group = this.options.controller.selected;
    if (!list || !group || !account) return;
    this.options.members.clearPanel();
    list.replaceChildren();
    for (const member of group.state.members) {
      const row = document.createElement('li');
      row.className = 'group-member-row';
      const role =
        member.role === 'owner'
          ? t('Owner')
          : member.role === 'admin'
            ? t('Administrator')
            : t('Member');
      row.append(this.options.members.identity(member.accountId, role));
      const controls = document.createElement('div');
      this.renderMemberActions(controls, group, member);
      if (
        !group.localOnly &&
        this.options.members.contactCandidate(member.accountId)
      )
        controls.append(
          withMenuIcon(
            this.button(t('Add to contacts'), () =>
              this.options.members.offerContact(member.accountId),
            ),
            'member',
          ),
        );
      if (controls.children.length)
        groupMemberActions(
          row,
          this.options.members.name(member.accountId),
        ).append(...controls.children);
      list.append(row);
    }
    this.renderOwnership(group, account);
  }
  private renderOwnership(group: GroupSummary, account: string): void {
    const owner = group.state.owner === account,
      alone = group.state.members.length < 2;
    // An owner alone in the group can only delete it.
    const leave = this.node('[data-group-leave]');
    if (leave) leave.hidden = !!group.localOnly || (owner && alone);
    const transfer = this.node('[data-group-owner-note]');
    if (transfer) transfer.hidden = !!group.localOnly || !owner || alone;
    const deletion = this.node('[data-group-delete]');
    if (deletion)
      deletion.hidden = !!group.localOnly || group.state.owner !== account;
  }
  private renderMemberActions(
    row: HTMLElement,
    group: GroupSummary,
    member: GroupSummary['state']['members'][number],
  ): void {
    const account = this.options.account();
    if (
      !account ||
      group.localOnly ||
      member.role === 'owner' ||
      member.accountId === account
    )
      return;
    if (groupManager(group.state, account))
      row.append(
        withMenuIcon(
          this.button(t('Remove'), async () => {
            if (
              !window.confirm(
                t('Remove {0} from the group?', [
                  this.options.members.name(member.accountId),
                ]),
              )
            )
              return;
            await this.options.controller.change({
              kind: 'remove',
              target: member.accountId,
            });
            await this.options.refresh();
          }),
          'remove',
        ),
      );
    if (group.state.owner !== account) return;
    row.append(
      withMenuIcon(
        this.button(
          member.role === 'admin' ? t('Make member') : t('Make administrator'),
          async () => {
            await this.options.controller.change({
              kind: 'role',
              target: member.accountId,
              role: member.role === 'admin' ? 'member' : 'admin',
            });
            await this.options.refresh();
          },
        ),
        member.role === 'admin' ? 'member' : 'admin',
      ),
    );
    row.append(
      withMenuIcon(
        this.button(t('Make owner'), async () => {
          if (
            !window.confirm(
              t(
                'Make {0} the owner now? They do not need to accept. You will become a regular member.',
                [this.options.members.name(member.accountId)],
              ),
            )
          )
            return;
          await this.options.controller.change({
            kind: 'transfer',
            target: member.accountId,
          });
          await this.options.refresh();
        }),
        'shield',
      ),
    );
  }
  renderInvites(): void {
    showGroupManagement(
      this.node('[data-group-manage]'),
      this.options.controller.selected,
      this.options.account(),
    );
  }
  renderIncoming(): void {
    const list = this.sidebar('[data-group-incoming]');
    if (!list) return;
    list.replaceChildren();
    for (const consent of this.options.controller.incoming) {
      const row = document.createElement('div'),
        label = document.createElement('p');
      label.textContent =
        consent.kind === 'invite'
          ? t('{0} invited you to a group.', [
              this.options.members.name(consent.actor),
            ])
          : t(
              '{0} offered you ownership of a group. Accept to take over administration.',
              [this.options.members.name(consent.actor)],
            );
      row.append(label);
      row.append(
        this.button(
          consent.kind === 'invite' ? t('Join group') : t('Accept ownership'),
          async () => {
            await this.options.controller.respond(consent, true);
            await this.options.refresh();
            const group = this.options.controller.entries.find(
              (g) => g.state.groupId === consent.groupId,
            );
            if (group) await this.options.open(group);
          },
        ),
      );
      row.append(
        this.button(t('Decline'), async () => {
          await this.options.controller.respond(consent, false);
          await this.options.controller.refreshIncoming();
          this.renderIncoming();
        }),
      );
      list.append(row);
    }
    const more = this.sidebar('[data-group-more-incoming]');
    if (more) more.hidden = this.options.controller.incomingNext === null;
  }
  renderCreation(): void {
    const mode = this.sidebar('[data-group-mode]');
    if (mode)
      mode.textContent =
        this.options.controller.mode === 'configured'
          ? t(
              'Free creation, with no total limit. Up to one creation per minute and ten per hour.',
            )
          : t('Checking group availability…');
    const toggle = this.sidebar<HTMLButtonElement>('[data-group-new]');
    if (toggle)
      toggle.disabled =
        this.options.isBusy() || this.options.controller.mode === 'unavailable';
    const cancel = this.sidebar('[data-group-cancel-create]');
    if (cancel) cancel.hidden = !this.options.controller.creationPending;
  }
  private bindAside(): void {
    this.sidebar('[data-group-new]')?.addEventListener('click', () =>
      this.actions.showCreate(),
    );
    this.sidebar('[data-group-cancel-create]')?.addEventListener(
      'click',
      () =>
        void this.options.run(async () => {
          await this.options.controller.cancelCreation();
          this.options.report(
            t(
              'Local request discarded. If the server already created the group, it remains in the list.',
            ),
          );
          await this.options.refresh();
        }),
    );
    this.sidebar('[data-group-more-incoming]')?.addEventListener(
      'click',
      () =>
        void this.options.run(async () => {
          await this.options.controller.refreshIncoming(true);
          this.renderIncoming();
        }),
    );
  }
}
