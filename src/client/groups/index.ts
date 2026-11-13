import type { IdentityPreparation } from '../peer-identity/index.ts';
import { networkAvailable } from '../connectivity/index.ts';
import { revealMessage, renderSearchReturn } from '../chat-ui/index.ts';
import type { ForwardDirectory } from '../message-forward/index.ts';
import type { DailyView } from '../daily-text/index.ts';
import type { GroupMessageView } from './message-content.ts';
import { groupMessageView } from './message-content.ts';
import {
  MediaGallery,
  galleryCount,
  galleryItems,
} from '../media-gallery/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import { GroupMemberPresentation } from './member-presentation.ts';
import { GroupReconciliation } from './reconciliation.ts';
import { GroupHistoryWork } from './history-work.ts';
import type { MessageWork } from '../synchronization-work/index.ts';
import {
  expectedInterruption,
  WorkInterruption,
} from '../synchronization-work/index.ts';
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
import type { Peer, WalletContact } from '../../shared/contacts/index.ts';
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
import type { ConversationStars } from '../message-stars/index.ts';
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
  alias: (account: string) => string;
  addContact: (wallet: WalletContact, alias: string) => void;
  profile: GroupProfile;
  forwarding?: ForwardDirectory;
  forward?: (view: DailyView<GroupMessageView>, peer: string) => Promise<void>;
  flushForward?: () => Promise<void>;
  organizationPeers?: () => readonly string[];
  /** Message search limited to one group, opened from its settings. */
  searchConversation?: (group: { id: string; title: string }) => void;
  /** The person's own starred messages, kept in their vault. */
  stars?: ConversationStars;
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
    () => options.changed(),
  );
  let session: AccountSession | null = null,
    host: HTMLElement | null = null,
    aside: HTMLElement | null = null,
    notice = t('Open a group to chat.');
  let states = new Map<string, PeerState>();
  const loading = new ChatHistoryLoading();
  const gallery = new MediaGallery<GroupMessageView>();
  const report = (text: string) => {
    notice = text;
  };
  const members = new GroupMemberPresentation({
    controller,
    account: () => session?.accountId,
    alias: options.alias,
    peers: options.peers,
    profile: options.profile,
    addContact: options.addContact,
    redraw: () => {
      chat.renderHistory();
      management.renderMembers();
    },
  });
  const chat = new GroupChatView({
    controller,
    account: () => session?.accountId,
    playback: options.playback,
    externalMedia: options.externalMedia,
    isBusy: options.isBusy,
    members,
    peers: options.peers,
    ...(options.forwarding ? { forwarding: options.forwarding } : {}),
    ...(options.forward ? { forward: options.forward } : {}),
    ...(options.flushForward ? { flushForward: options.flushForward } : {}),
    ...(options.stars ? { stars: options.stars } : {}),
    visibleGroup,
    reconcile: (id) => reconciliation.request(id),
    operationRun: options.run,
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
    members,
    peers: options.peers,
    profile: options.profile,
    refresh,
    open,
    isBusy: options.isBusy,
    run,
    dialogRun: options.run,
    report,
    render,
    shortcuts: {
      mute: (id) => ({
        read: async () => (await options.daily.state(id)).mutedUntil,
        apply: async (duration) => {
          await options.daily.mute(id, duration, { settingsId: id });
          await refreshStates();
          options.changed();
        },
      }),
      ...(options.searchConversation
        ? { search: options.searchConversation }
        : {}),
      media: (group: { id: string; title: string }) => ({
        count: galleryCount(
          galleryItems(controller.views.map(groupMessageView)),
        ),
        open: () => showGallery(group.title),
      }),
      ...(options.stars
        ? {
            starred: (group: { id: string }) =>
              options.stars!.showList(group.id, (message) => {
                const summary = controller.entries.find(
                  (entry) => entry.state.groupId === group.id,
                );
                if (summary)
                  void revealGroupMessage(
                    summary,
                    message.id,
                    message.sequence,
                  );
              }),
          }
        : {}),
    },
    settingsOpened: () => vault.preview(),
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
    return members.name(account);
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
  function guardSession(current: AccountSession | null): void {
    if (
      current?.accountId !== session?.accountId ||
      current?.deviceId !== session?.deviceId ||
      current?.csrf !== session?.csrf
    )
      throw new WorkInterruption('session');
  }
  async function refresh(more = false): Promise<void> {
    const current = session;
    await refreshDirectory(more);
    guardSession(current);
    await finishDirectoryRefresh();
  }
  async function refreshDirectory(
    more = false,
    preparation?: IdentityPreparation,
  ): Promise<void> {
    const current = session;
    const previous = controller.selected;
    await controller.refreshDirectory(more, preparation);
    guardSession(current);
    updateOwnerNotice(previous);
    publishGroupHeads();
    options.changed();
  }
  function publishGroupHeads(): void {
    options.daily.setGroups(
      controller.entries
        .filter((g) => !g.localOnly)
        .map((g) => ({ id: g.state.groupId, head: g.head })),
    );
  }
  async function finishDirectoryRefresh(): Promise<void> {
    const current = session;
    const previous = controller.selected;
    const selected = previous?.state.groupId;
    await controller.finishDirectoryRefresh();
    guardSession(current);
    updateOwnerNotice(previous);
    publishGroupHeads();
    await options.daily.loadSettings([
      ...(options.organizationPeers?.() ??
        options.peers().map((p) => p.accountId)),
      ...controller.entries.map((g) => g.state.groupId),
    ]);
    guardSession(current);
    await refreshStates();
    guardSession(current);
    management.renderIncoming();
    management.renderCreation();
    options.changed();
    await resumeIncompleteHistory(selected);
    await refreshSelected(selected);
  }
  /** Unread counts and alerts for the listed groups; no history or profiles. */
  async function refreshStates(): Promise<void> {
    const current = session;
    const previous = states;
    const next = networkAvailable()
      ? await options.daily.groupStates()
      : new Map<string, PeerState>();
    guardSession(current);
    states = next;
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
    },
  });
  const readHistory = async (
    id: string,
    older: boolean,
    localOnly: boolean,
  ): Promise<void> => {
    const started = performance.now();
    await historyWork.open({ id, older, localOnly });
    if (!older && !localOnly) chat.settleOutgoing(id, started);
  };
  function visibleGroup(): string | null {
    const selected = controller.selected;
    return selected &&
      !selected.localOnly &&
      document.visibilityState === 'visible' &&
      host?.getClientRects().length
      ? selected.state.groupId
      : null;
  }
  const reconciliation = new GroupReconciliation((id) =>
    readHistory(id, false, false),
  );
  const receipt = new GroupReceipt({
    visibleGroup,
    readSelected: (id) => reconciliation.request(id),
    receipts: async () => {
      await controller.refreshReceipts();
      chat.renderHistory();
    },
    states: refreshStates,
    directory: () => refresh(),
    changed: () => options.changed(),
  });
  async function open(
    group: GroupSummary | string,
    focus?: { sequence: number },
  ): Promise<void> {
    const id = typeof group === 'string' ? group : group.state.groupId,
      localOnly = typeof group === 'string' ? false : !!group.localOnly;
    if (focus) controller.focusMessage(id, focus.sequence);
    else controller.latest();
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
    const history = node('[data-group-history]');
    if (history)
      renderSearchReturn(history, {
        active: () => controller.searchFocused,
        latest: () => {
          controller.latest();
          void run(() => reopen());
        },
      });
    management.renderMembers();
    members.load(group);
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
    gallery.close();
    management.closeSettings();
    members.clearConversation();
    if (chat.recording)
      throw new Error(
        'Send or remove the voice preview before changing conversations.',
      );
    controller.deselect();
    management.deselected();
    chat.deselect();
  }
  function leave(): void {
    gallery.close();
    management.leave();
    chat.leave();
  }
  function clearSessionPanels(): void {
    gallery.close();
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
  /** Media, Links and Docs of the open group's loaded messages. */
  function showGallery(title: string): void {
    gallery.show({
      title,
      views: () => controller.views.map(groupMessageView),
      media: (view, thumbnail) => controller.media(view, thumbnail),
      older: {
        available: () => controller.olderAvailable,
        load: async () => {
          await reopen(true);
          return true;
        },
      },
      open: (view) => {
        const group = controller.selected;
        if (group) void revealGroupMessage(group, view.id, view.sequence);
      },
    });
  }
  /** Opens a group at one message and marks it (search results, stars). */
  async function revealGroupMessage(
    group: GroupSummary,
    id: string,
    sequence: number,
  ): Promise<void> {
    controller.focusMessage(group.state.groupId, sequence);
    await open(group, { sequence });
    await revealMessage(id, {
      row: (target) =>
        node('[data-group-history]')?.querySelector<HTMLElement>(
          `article[data-group-message="${CSS.escape(target)}"]`,
        ) ?? null,
      older: { available: () => false, load: () => Promise.resolve(false) },
      valid: () => controller.selected?.state.groupId === group.state.groupId,
    });
  }
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
    preview: (id: string) => controller.preview(id),
    media: (view: GroupView, thumbnail: boolean) =>
      controller.media(view, thumbnail),
    composeFor: (
      id: string,
      text: string,
      selection: AttachmentSelection | null,
    ) => controller.composeFor(id, text, selection),
    sendGroupDrafts: (id: string) => controller.sendGroupDrafts(id),
    reveal: revealGroupMessage,
    unread: (id: string) => states.get(id)?.unread ?? 0,
    search: (query: string, after: string | null) =>
      controller.search(query, after),
    refresh,
    refreshDirectory,
    finishDirectoryRefresh,
    prepareDirectoryPreviews: () => controller.prepareDirectoryPreviews(),
    previewPresented: (host: HTMLElement, groups: readonly string[]) =>
      controller.previewPresented(host, groups),
    directoryPresented: (host: HTMLElement, matchingRows: boolean) =>
      controller.directoryPresented(host, matchingRows),
    /** A categorized change; only a general wakeup refreshes the directory. */
    changed: (change: GroupChange) => {
      if (change === 'content') chat.hint();
      return receipt.changed(change);
    },
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
      chat.resetTexts();
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
    /** A bare removal notice may be this tab's own deletion coming back. */
    get expectingOwnRemoval(): boolean {
      return controller.expectingOwnRemoval;
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
