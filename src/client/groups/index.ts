import { GroupHistoryWork } from './history-work.ts';
import type { MessageWork } from '../synchronization-work/index.ts';
import { expectedInterruption } from '../synchronization-work/index.ts';
export { readGroupNotification } from './notification.ts';
import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
import { GroupChatView } from './chat-view.ts';
import { GroupManagementPanel } from './management-panel.ts';
import { GroupVaultPanel } from './vault-panel.ts';
import {
  chatIcon,
  ChatHistoryLoading,
  chatCollapse,
  chatComposer,
} from '../chat-ui/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import type { Daily, PeerState } from '../daily/index.ts';
import { GroupController } from './controller.ts';
import { GroupReceipt } from './receipt.ts';
import type { GroupChange } from './receipt.ts';
import type { GroupSummary } from './controller.ts';
import type { GroupView } from './reader.ts';
import type { GroupProfile } from './people.ts';
export type { GroupSummary, GroupView };
export { showGroupDirectoryPhoto } from './directory-photo.ts';
export { GroupBackups } from './backup.ts';
interface GroupOptions {
  externalMedia?: ExternalMediaConsent | undefined;
  playback: VoicePlayback;
  daily: Daily;
  run: (work: () => Promise<void>) => Promise<void>;
  history?: (
    work: MessageWork,
    settled?: () => Promise<void>,
  ) => Promise<boolean>;
  changed: () => void;
  select: () => void;
  isBusy: () => boolean;
  alert: () => void;
  peers: () => readonly Peer[];
  profile: GroupProfile;
  organizationPeers?: () => readonly string[];
}
export function startGroups(
  access: VaultAccess,
  sync: VaultSync,
  options: GroupOptions,
) {
  const controller = new GroupController(
    access,
    sync,
    () =>
      document.visibilityState === 'visible' && !!host?.getClientRects().length,
  );
  let session: AccountSession | null = null,
    host: HTMLElement | null = null,
    aside: HTMLElement | null = null,
    notice = t('Open a group to chat.');
  let states = new Map<string, PeerState>();
  const loading = new ChatHistoryLoading();
  const report = (text: string) => {
    notice = text;
  };
  const chat = new GroupChatView({
    controller,
    account: () => session?.accountId,
    playback: options.playback,
    externalMedia: options.externalMedia,
    isBusy: options.isBusy,
    name,
    run,
    reopen,
    select: options.select,
    report,
    status,
  });
  const management = new GroupManagementPanel({
    access,
    controller,
    account: () => session?.accountId,
    name,
    peers: options.peers,
    profile: options.profile,
    refresh,
    open,
    isBusy: options.isBusy,
    run,
    dialogRun: options.run,
    report,
    render,
  });
  const vault = new GroupVaultPanel({
    controller,
    account: () => session?.accountId,
    isBusy: options.isBusy,
    run,
    reopen,
    report,
  });
  function node<T extends HTMLElement>(selector: string): T | null {
    return host?.querySelector<T>(selector) ?? null;
  }
  function status(): void {
    const settingsNotice = node('[data-group-settings-notice]');
    if (settingsNotice)
      settingsNotice.textContent = [
        t('Group opened.'),
        t('Message sent.'),
      ].includes(notice)
        ? ''
        : notice;
    const label = node('[data-group-notice]');
    const selected = controller.selected;
    const initialLoading = loading.update({
      conversation: selected
        ? `${selected.state.groupId}:${!!selected.localOnly}`
        : null,
      ready: false,
    });
    if (label)
      label.textContent =
        [t('Group opened.'), t('Message sent.')].includes(notice) ||
        (notice === t('Syncing…') && !initialLoading)
          ? ''
          : notice;
    chat.status();
    management.renderCreation();
  }
  async function run(work: () => Promise<void>): Promise<void> {
    await options.run(async () => {
      try {
        await work();
      } catch (error: unknown) {
        if (expectedInterruption(error)) return;
        notice =
          error instanceof Error
            ? translatedError(error.message)
            : t('Could not complete the group operation.');
        throw error;
      } finally {
        status();
        options.changed();
      }
    });
  }
  function name(account: string): string {
    return account === session?.accountId
      ? t('You')
      : options.peers().find((p) => p.accountId === account)?.name ||
          t('Member {0}', [account.slice(0, 8)]);
  }
  function listLabel(group: GroupSummary): string {
    const id = group.state.groupId,
      settings = options.daily.conversation(id),
      state = states.get(id);
    const cleanup = cleanupLabel(state);
    return t('{0}{1} · {2}{3}{4}{5}', [
      settings.pinned ? '📌 ' : '',
      group.title,
      group.localOnly ? t('local group copy') : t('group'),
      state?.unread ? t(' · {0} unread', [state.unread]) : '',
      state && state.mutedUntil > Date.now() ? t(' · muted') : '',
      cleanup,
    ]);
  }
  function cleanupLabel(state: PeerState | undefined): string {
    return state?.cleanup
      ? t(' · ⚠ media cleanup in {0}', [
          new Date(state.cleanup.dueAt).toLocaleString(currentLanguage()),
        ])
      : '';
  }
  async function refresh(more = false): Promise<void> {
    const previousGroup = controller.selected,
      selected = previousGroup?.state.groupId;
    await controller.refresh(more);
    updateOwnerNotice(previousGroup);
    options.daily.setGroups(
      controller.entries
        .filter((g) => !g.localOnly)
        .map((g) => ({ id: g.state.groupId, head: g.head })),
    );
    await options.daily.loadSettings([
      ...(options.organizationPeers?.() ??
        options.peers().map((p) => p.accountId)),
      ...controller.entries.map((g) => g.state.groupId),
    ]);
    await refreshStates();
    management.renderIncoming();
    management.renderCreation();
    options.changed();
    await resumeIncompleteHistory(selected);
    await refreshSelected(selected);
  }
  /** Unread counts and alerts for the listed groups; no history or profiles. */
  async function refreshStates(): Promise<void> {
    const previous = states;
    states = navigator.onLine
      ? await options.daily.groupStates()
      : new Map<string, PeerState>();
    for (const [id, state] of states) {
      const old = previous.get(id);
      if (old && state.unread > old.unread && state.mutedUntil <= Date.now())
        options.alert();
    }
  }
  async function resumeIncompleteHistory(
    selected: string | undefined,
  ): Promise<void> {
    if (!selected || controller.selected?.state.groupId !== selected) return;
    if (controller.historyPending) await readHistory(selected, false, false);
  }
  function updateOwnerNotice(previous: GroupSummary | null): void {
    if (previous && previous.state.owner !== controller.selected?.state.owner)
      notice = t('Group ownership updated.');
  }
  async function refreshSelected(selected: string | undefined): Promise<void> {
    if (!selected || controller.selected?.state.groupId !== selected) return;
    if (
      document.visibilityState !== 'visible' ||
      !host?.getClientRects().length
    )
      return;
    const group = controller.entries.find(
      (group) => group.state.groupId === selected,
    );
    if (!group) {
      controller.deselect();
      render();
      return;
    }
    if (group.localOnly) await readHistory(selected, false, true);
    await resumePending();
    await vault.refresh();
    render();
  }
  async function resumePending(): Promise<void> {
    if (await controller.resumePending()) await reopen();
  }
  const historyWork = new GroupHistoryWork({
    controller,
    schedule: options.history,
    settled: async () => {
      const selected = controller.selected;
      await vault.refresh();
      if (!selected || controller.selected !== selected) return;
      loading.update({
        conversation: `${selected.state.groupId}:${!!selected.localOnly}`,
        ready: true,
      });
      notice = controller.warning || t('Group opened.');
      render();
      await chat.pending();
    },
  });
  const readHistory = (id: string, older: boolean, localOnly: boolean) =>
    historyWork.open({ id, older, localOnly });
  const receipt = new GroupReceipt({
    visibleGroup: () => {
      const selected = controller.selected;
      return selected &&
        !selected.localOnly &&
        document.visibilityState === 'visible' &&
        host?.getClientRects().length
        ? selected.state.groupId
        : null;
    },
    readSelected: (id) => readHistory(id, false, false),
    receipts: async () => {
      await controller.refreshReceipts();
      chat.renderHistory();
    },
    states: refreshStates,
    directory: () => refresh(),
    changed: () => options.changed(),
  });
  async function open(group: GroupSummary | string): Promise<void> {
    const id = typeof group === 'string' ? group : group.state.groupId,
      localOnly = typeof group === 'string' ? false : !!group.localOnly;
    chat.open(id);
    try {
      await readHistory(id, false, localOnly);
    } finally {
      options.changed();
    }
    if (controller.historyPending) notice = t('Syncing…');
    render();
  }
  function render(): void {
    const group = controller.selected;
    management.updateSettingsGroup(group);
    if (!group) {
      if (host) host.hidden = true;
      return;
    }
    management.renderIdentity(group);
    chat.renderHistory();
    management.renderMembers();
    vault.render();
    management.renderInvites();
    status();
  }
  async function reopen(older = false): Promise<void> {
    const id = controller.selected?.state.groupId;
    if (!id) return;
    await readHistory(id, older, !!controller.selected?.localOnly);
    render();
  }
  function deselect(): void {
    chat.closeActions();
    management.closeSettings();
    if (chat.recording)
      throw new Error(
        'Send or remove the voice preview before changing conversations.',
      );
    controller.deselect();
    management.deselected();
    chat.deselect();
  }
  function leave(): void {
    management.leave();
    chat.leave();
  }
  function clearSessionPanels(): void {
    management.clearSession();
    for (const container of [host, aside]) {
      container?.querySelectorAll('form').forEach((form) => form.reset());
      container
        ?.querySelectorAll(
          'ul, [data-group-incoming], [data-group-history], [data-attachment-preview]',
        )
        .forEach((list) => list.replaceChildren());
    }
    management.clearAdmission();
    notice = t('Open a group to chat.');
  }
  chat.bindBrowserLifetime();
  return {
    create: () => management.create(),
    join: (url = '') => management.join(url),
    get entries(): readonly GroupSummary[] {
      return controller.entries;
    },
    get next(): string | null {
      return controller.next;
    },
    get selected(): GroupSummary | null {
      return controller.selected;
    },
    get recording(): boolean {
      return chat.recording;
    },
    listLabel,
    photo: (group: GroupSummary) => controller.photo(group),
    /** Invitations and ownership offers for Atividade, named as in the group tools. */
    async invites(): Promise<
      readonly { id: string; kind: 'invite' | 'transfer'; actor: string }[]
    > {
      await controller.refreshIncoming();
      return controller.incoming.map((consent) => ({
        id: consent.id,
        kind: consent.kind,
        actor: name(consent.actor),
      }));
    },
    async respondInvite(id: string, accept: boolean): Promise<void> {
      const consent = controller.incoming.find((item) => item.id === id);
      if (!consent) throw new Error('This invitation is no longer available.');
      await controller.respond(consent, accept);
      if (accept) await refresh();
      await controller.refreshIncoming();
      management.renderIncoming();
    },
    unread: (id: string) => states.get(id)?.unread ?? 0,
    search: (query: string, after: string | null) =>
      controller.search(query, after),
    refresh,
    /** A categorized change; only a general wakeup refreshes the directory. */
    changed: (change: GroupChange) => receipt.changed(change),
    counters: () => receipt.counters(),
    synchronizeAll: (signal: AbortSignal) => controller.synchronizeAll(signal),
    pauseSynchronization: () => controller.pauseSynchronization(),
    resumePending,
    pendingWork: () => controller.pendingWork(),
    open,
    status,
    deselect,
    historyChanged: () => controller.historyChanged(),
    setSession(value: AccountSession | null): void {
      const identity = (s: AccountSession | null) =>
        s ? [s.accountId, s.deviceId, s.csrf].join(':') : '';
      if (identity(value) === identity(session)) {
        session = value;
        controller.setSession(value);
        return;
      }
      session = value;
      loading.reset();
      chat.closeActions();
      management.setSession(value);
      chat.invalidateHistory();
      controller.setSession(value);
      chat.clearSession();
      clearSessionPanels();
      states.clear();
      vault.reset();
      render();
    },
    removed(): void {
      controller.removed();
      chat.pauseActions();
      chat.renderHistory();
    },
    suspend(revoked = false): void {
      chat.closeActions();
      management.leave();
      if (revoked) controller.revokeAuthority();
      else controller.hide();
      chat.suspend(revoked);
    },
    leave,
    canActivate: () => chat.canActivate(),
    mount(container: HTMLElement, sidebarContainer: HTMLElement): void {
      host = container;
      aside = sidebarContainer;
      container.hidden = !controller.selected;
      if (session) container.dataset['voicePeer'] = session.accountId;
      container.innerHTML = t('html.e652af8025ee', [
        chatIcon('back'),
        chatIcon('more'),
        chatCollapse(),
        chatComposer('group'),
      ]);
      management.mount(container, sidebarContainer);
      vault.mount(container);
      chat.mount(container);
      management.renderCreation();
      management.renderIncoming();
    },
  };
}
