import { afterMessageWork, awaitMessageWork } from './continuation.ts';
export { notificationMessages } from './notification.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { MessageContinuity } from './continuity.ts';
import { loadMessageDirectory } from './startup.ts';
import { MessageSynchronization } from './synchronization.ts';
import type { ChangeFollowupScope } from './change-followup.ts';
import { MessageLiveUpdates } from './live-updates.ts';
import { SelectedPreviewAdmission } from './preview-admission.ts';
import { ConversationActivity } from './activity.ts';
import { MessageWarmup } from './warmup.ts';
import { ConnectedConversationVisits } from './visits.ts';
import { traceChatSync } from '../chat-sync-diagnostics/index.ts';
import {
  publishVerifiedConversationPreview,
  publishVerifiedPreviewReceipts,
} from './verified-previews.ts';
import { TextSendQueue } from '../text-send/index.ts';
import { ReceiptPreviews } from './receipt-previews.ts';
import { OutgoingTexts } from './outgoing-text.ts';
import { MessageHistoryUi } from './history-ui.ts';
import { bindMessageLifecycle } from './lifecycle.ts';
import {
  directChat,
  bindChatOptions,
  resetHistoryPosition,
} from '../chat-ui/index.ts';
import { shortAddress } from '../appearance/index.ts';
import type { HistoryUpdate } from '../message-visibility/index.ts';
import { mountPushSettings } from '../push-settings/index.ts';
import { notificationSettings } from './settings.ts';
import { ConversationSearch } from './search.ts';
import type { SearchItem, SearchPage } from './search.ts';
import { revealMessage } from './search-reveal.ts';
import { showToast } from '../toast/index.ts';
import type { ConversationAction, ConversationEntry } from './directory.ts';
import { ConversationMenu } from './directory-menu.ts';
import { ContactDirectory, Contacts } from '../contacts/index.ts';
import { organizationActions } from './directory-actions.ts';
import { startGroups } from '../groups/index.ts';
import type { startRepresentatives } from '../representatives/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import type { LiveEvent } from '../message-live/index.ts';
import { LiveMessages } from '../message-live/index.ts';
import type { LiveUpdate } from '../message-live/index.ts';
import { Daily } from '../daily/index.ts';
import type { PeerState } from '../daily/index.ts';
import type { DailyView } from '../daily-text/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import {
  NotificationSound,
  soundPreferenceKey,
  savePushSoundPreference,
} from '../notification-sound/index.ts';
import { encodeDailyText } from '../../shared/daily/index.ts';
import type { DailyPreferences } from '../../shared/daily/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type {
  Peer,
  AddressBookEntry,
  WalletContact,
} from '../../shared/contacts/index.ts';
import type {
  VaultAccess,
  VaultWorkOptions,
} from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { Messages } from './controller.ts';
import type { MessageView } from './controller.ts';
import { MessageDirectory } from './directory-controller.ts';
import type { ConversationPeer } from './directory-controller.ts';
import { MessageDirectoryUi } from './directory-ui.ts';
import { PeerPhotos } from './peer-photos.ts';
import { ProfileBroadcast } from './profile-broadcast.ts';
import { ConversationPreviewLoader } from '../conversation-preview/index.ts';
import { uploadStatus } from '../upload-progress/index.ts';
import { MessageComposer } from './composer.ts';
export function startMessages(
  access: VaultAccess,
  sync: VaultSync,
  options: {
    externalMedia?: ExternalMediaConsent;
    calls?: { start: (peer: string) => Promise<void>; active: () => boolean };
    playback: VoicePlayback;
    openConversation: () => void;
    openContact: (contact: AddressBookEntry) => void;
    /** Add-contact editor prefilled with a group member's wallet. */
    addContact: (wallet: WalletContact, alias: string) => void;
    directoryChanged: (available: boolean) => void;
    unreadChanged?: (count: number) => void;
    directorySettled?: (session: AccountSession | null) => void;
    representatives?: ReturnType<typeof startRepresentatives>;
    liveEvent?: (event: LiveEvent) => void;
    liveState?: (connected: boolean) => void;
    sharedProfile: () =>
      import('../message-profile/index.ts').ProfileCard | null;
    preferences: () => DailyPreferences | null;
  },
) {
  const { playback, sharedProfile, preferences } = options;
  const contacts = new Contacts(access),
    daily = new Daily(access, sync);
  const sound = new NotificationSound();
  const agenda = new ContactDirectory(sync),
    menu = new ConversationMenu();
  // Accounts with an active status, from the status list the app already loads.
  let statusAuthors: ReadonlySet<string> = new Set();
  let externalAbort = new AbortController();
  let states = new Map<string, PeerState>();
  let navigatingToConversation = false;
  let directory: HTMLElement | null = null;
  const searchPanel = new ConversationSearch(searchPage, openSearchResult);
  let mounted: HTMLElement | null = null,
    selected: ConversationPeer | null = null,
    session: AccountSession | null = null,
    rows: readonly MessageView[] | null = null,
    generation = 0;
  let settingsHost: HTMLElement | null = null;
  let pushSettings: ReturnType<typeof mountPushSettings> | null = null;
  let message = t('Sign in and authorize this device to chat.');
  // Sent fraction of the attachment being uploaded, shown as a ring (16/10/2026).
  const uploadIndicator = uploadStatus();
  let uploading: number | null = null;
  function composerStatus(): void {
    composer.update();
  }
  const outgoing = new OutgoingTexts();
  const previewAdmission = new SelectedPreviewAdmission();
  let pendingRender = 0;
  const controller = new Messages(
    access,
    sync,
    (value, update, projection) => {
      pendingRender++;
      rows = value;
      outgoing.observed(value);
      previewAdmission.observe({
        rows: value,
        projection,
        online: navigator.onLine,
        localOnly: selected?.localOnly ?? false,
      });
      publishVerifiedConversationPreview({
        rows: value,
        update,
        projection,
        previews,
        online: navigator.onLine,
        localOnly: selected?.localOnly ?? false,
      });
      renderHistory(update);
    },
    {
      recovery: () => synchronization.requestInbox('direct'),
      stale: () => synchronization.windowBehind('direct'),
      elsewhere: () => refreshDirectoryPreviews(),
      published: (value) => {
        outgoing.acknowledge(value);
        renderHistory();
      },
      verified: (peer, verifiedRows) =>
        publishVerifiedConversationPreview({
          rows: verifiedRows,
          projection: { peer, latest: true },
          previews,
          online: navigator.onLine,
          localOnly: false,
        }),
      receipt: (receipt) => receiptPreviews.commit(receipt),
    },
  );
  const composer = new MessageComposer({
    playback,
    controller,
    ...(options.externalMedia ? { externalMedia: options.externalMedia } : {}),
    signal: () => externalAbort.signal,
    availability: () => ({
      peer: selected?.accountId ?? null,
      localOnly: !!selected?.localOnly,
      authenticated: session !== null,
      busy: synchronization.busy,
      historyReady: rows !== null,
      callActive: !!options.calls?.active(),
      textSendBlocked: canQueueText() ? textQueue.full : undefined,
    }),
    run,
    textChanged: () => {
      if (canQueueText() && composer.text) textQueue.deferBackground();
    },
    report: (notice) => {
      message = notice;
      status();
    },
    sendGif,
    ...(options.calls
      ? { call: (peer: string) => options.calls!.start(peer) }
      : {}),
  });
  const previews = new ConversationPreviewLoader({
    load: (peers) => controller.directoryPreviews(peers),
    changed: renderContacts,
    available: () =>
      synchronization.backgroundReady && !synchronization.visibleUpdatePending,
    exclude: () =>
      previewAdmission.exclude(
        selected?.accountId ?? null,
        conversationVisible('[data-direct-conversation]'),
      ),
  });
  const receiptPreviews = new ReceiptPreviews({
    previews,
    excluded: () =>
      previewAdmission.exclude(
        selected?.accountId ?? null,
        conversationVisible('[data-direct-conversation]'),
      ),
    online: () => navigator.onLine,
    lookupAllowed: () => !startupWarmup.pending && !textQueue.pending,
    lookup: refreshDirectoryPreviews,
  });
  const groups = startGroups(access, sync, {
    externalMedia: options.externalMedia,
    playback,
    daily,
    run,
    history: (work, settled) => synchronization.history(work, settled),
    changed: () => renderContacts(),
    peers: () => directoryData.peers.filter((p) => !p.localOnly),
    alias: (account) =>
      agenda.entries.find(
        (entry) =>
          entry.contact.accountId === account && !entry.contact.removed,
      )?.contact.alias ?? '',
    addContact: options.addContact,
    profile: (id) =>
      id === session?.accountId
        ? Promise.resolve(sharedProfile())
        : controller.knownProfile(id),
    organizationPeers: () => organizationIds(),
    isBusy: () => synchronization.busy,
    alert: () => sound.alert('group'),
    select: selectGroup,
  });
  const directoryData = new MessageDirectory({
    agenda,
    contacts,
    archivedPeers: (after, work) => controller.archivedPeers(after, work),
    changed: (peers) => {
      if (selected)
        selected =
          peers.find((peer) => peer.accountId === selected?.accountId) ??
          selected;
      renderContacts();
    },
  });
  const peerPhotos = new PeerPhotos({
    scope: () => session?.accountId ?? null,
    load: (id) => controller.knownProfile(id),
  });
  const showPeerPhoto = (
    host: HTMLElement,
    peer: string,
    signal: AbortSignal,
    ready?: (url: string | null) => void,
  ) => peerPhotos.show(host, peer, signal, ready);
  const directoryUi = new MessageDirectoryUi({
    previews: previews.values,
    previewsFailed: () => previews.failed,
    peerPhoto: showPeerPhoto,
    snapshot: () => ({
      peers: directoryData.peers,
      selected,
      states,
      statusAuthors,
      session,
    }),
    agenda,
    daily,
    groups,
    menu,
    searchPanel,
    node,
    host: () => directory,
    contactActions,
    perform: performDirectoryAction,
    openPeer: (peer) => {
      void requestPeer(peer);
    },
    openContact: options.openContact,
    openGroup: (group) => {
      void synchronization.open(() => groups.open(group));
    },
    changed: options.directoryChanged,
    unreadChanged: (count) => options.unreadChanged?.(count),
    presence: renderPresence,
  });
  const activity = new ConversationActivity({
    generation: () => generation,
    current: (current) => current === generation && !!session && connected(),
    peers: () =>
      directoryData.peers.map((peer) => ({
        id: peer.accountId,
        settings: directoryUi.contactOrganizationId(
          agenda.find(peer),
          peer.accountId,
        ),
        ...(peer.localOnly ? { localOnly: true } : {}),
      })),
    daily,
    readVisible: () => historyUi.markRead(daily),
    previous: () => states,
    publish: (next) => {
      states = next;
      renderContacts();
    },
    alert: () => sound.alert('direct'),
  });
  function selectGroup(): void {
    if (composer.recording || composer.voicePreview)
      throw new Error(
        'Send or remove the voice preview before changing conversations.',
      );
    synchronization.cancelOpening();
    selected = null;
    enterConversation();
    composer.clearContext();
    composer.clearAttachment();
    controller.select(null);
    renderHistory();
    const direct = node('[data-direct-conversation]');
    if (direct) direct.hidden = true;
    renderContacts();
  }
  const live = new LiveMessages({
    access,
    changed: () => {
      controller.setLiveConnected(live.current);
      continuity.changed();
      options.liveState?.(live.current);
      const label = node('[data-message-live]');
      if (label) label.textContent = live.notice;
      synchronization.resume();
    },
    event: (event) => liveUpdates.event(event),
  });
  const liveUpdates = new MessageLiveUpdates({
    selected: () => (groups.selected ? 'groups' : selected ? 'direct' : null),
    visible: () =>
      conversationVisible(
        groups.selected
          ? '[data-group-conversation]'
          : '[data-direct-conversation]',
      ),
    invalidate: (event) => {
      invalidateGroupAuthority(event);
      if (event === 'ready' || event === 'authorization')
        void checkVoiceAuthority();
      hideLiveHistory(event);
    },
    appended: () => controller.appended(),
    request: (update, work, scope) =>
      synchronization.request(update, work, scope),
    inbox: (scope) => synchronization.requestInbox(scope),
    receive: (scope) => synchronization.receive(scope),
    projection: (work, scope) => synchronization.requestProjection(work, scope),
    counters: (scope) => synchronization.requestCounters(scope),
    previews: refreshDirectoryPreviews,
    external: (event) => options.liveEvent?.(event),
  });
  // Confirmed contacts get the new card after a profile change, not only on open.
  const profileBroadcast = new ProfileBroadcast({
    card: sharedProfile,
    peers: () =>
      directoryData.peers
        .filter((peer) => !peer.localOnly)
        .map((peer) => peer.accountId),
    share: (peer, card) => controller.shareProfile(peer, card),
    ready: () =>
      startupWarmup.ready &&
      !startupWarmup.pending &&
      !textQueue.pending &&
      !!session &&
      navigator.onLine &&
      document.visibilityState === 'visible' &&
      !synchronization.conversationWorkPending,
  });
  const synchronization: MessageSynchronization = new MessageSynchronization({
    state: () => ({
      generation,
      connected: connected(),
      session: !!session,
      online: navigator.onLine,
      visible: document.visibilityState === 'visible',
      suspended: continuity.suspended,
      liveConnecting: live.connecting,
      startupPending: startupWarmup.pending,
      textPending: textQueue.pending,
    }),
    status: () => {
      status();
      previews.resume();
    },
    visibleSettled: () => previews.resume(),
    notice: (value) => {
      message = value;
    },
    complete: () => {
      if (!startupWarmup.pending && !textQueue.pending)
        refreshDirectoryPreviews();
      announceSynchronized();
    },
    // The receiver already updated the list from its commit.
    receiptComplete: () => {
      receiptPreviews.settle();
      announceSynchronized();
    },
    renderPending,
    pause: () => {
      controller.pauseSynchronization();
      groups.pauseSynchronization();
    },
    preloadDirect: (signal, work) => controller.synchronizeAll(signal, work),
    preloadGroups: (signal) => groups.synchronizeAll(signal),
    unread: () => activity.refresh(),
    groupProjection: () => groups.counters(),
    presence: dailyTick,
    refresh,
    changes: refreshChangedSelected,
    changeMaintenance: [
      () => refreshContacts(),
      () => (groups.selected ? Promise.resolve() : groups.refresh()),
      async () => {
        contactsMore();
        await dailyTick();
      },
    ],
    periodic: periodicMessages,
    periodicWork: periodicMessageWork,
    pending: () => controller.pending(),
    sendPending: () => sendPending(),
  });
  const textQueue: TextSendQueue = new TextSendQueue({
    draftChanged: (draft, phase) => outgoing.update(draft, phase),
    save: (draft) => controller.queueText(draft),
    available: () => synchronization.foregroundReady,
    transmit: async () => {
      const ok = await synchronization.run(() =>
        sendPending({ priority: 'interactive' }),
      );
      return { ok, more: (await controller.pending()).length > 0 };
    },
    changed: () => {
      renderHistory();
      renderPending().catch(reportTextSaveError);
      status();
      synchronization.resume();
      if (!textQueue.pending) broadcastProfile();
    },
    failed: reportTextSaveError,
  });
  const startupWarmup: MessageWarmup = new MessageWarmup({
    available: () => synchronization.backgroundReady,
    run: (step) => synchronization.background(step),
    changed: () => {
      synchronization.resume();
      broadcastProfile();
    },
    failed: (error) => {
      message =
        error instanceof Error
          ? translatedError(error.message)
          : t('Could not complete the operation.');
      status();
    },
    steps: [
      // Speculative SDK/store preparation must yield to a requested history.
      () => controller.initialize(),
      async () => {
        await groups.refresh();
        contactsMore();
      },
      async () => {
        const current = generation;
        await sendPending();
        if (current === generation) await controller.savePins();
      },
      dailyTick,
      async () => {
        const current = generation;
        await previews.refresh(
          directoryData.peers
            .filter((peer) => !peer.localOnly)
            .map((peer) => peer.accountId),
        );
        if (current === generation) options.directorySettled?.(session);
      },
    ],
  });
  const continuity = new MessageContinuity({
    current: () => live.current,
    available: () => !!session && navigator.onLine,
    pause: suspend,
    stop: () => live.stop(),
    reconnect: () => live.retry(),
    check: () => requestRefresh('probe'),
  });
  const visits = new ConnectedConversationVisits<ConversationPeer>({
    connected: () => live.current && navigator.onLine && !continuity.suspended,
    available: () => synchronization.presentationReady,
    backgroundReady: () => synchronization.backgroundReady,
    reusable: (peer) =>
      !peer.localOnly && controller.canRestore(peer.accountId),
    diagnostic: (peer, reason) =>
      traceChatSync(controller, peer.accountId, {
        event: 'navigation',
        reason,
        ...synchronization.reuseDiagnostics(),
        textPending: textQueue.pending,
      }),
    select: selectPeer,
    restore: () => controller.restoreSelected(),
    background: (step) => synchronization.background(step),
    check: async () => {
      await refreshChangedSelected();
      await historyUi.markRead(daily);
    },
    failed: () => controller.hide(),
  });
  /** The name the conversation list shows: saved alias, profile name, then the address. */
  const peerTitle = (peer: ConversationPeer) =>
    agenda.find(peer)?.contact.alias || peer.name || peer.address;
  const historyUi = new MessageHistoryUi({
    receiptsVerified: (window) =>
      publishVerifiedPreviewReceipts({ ...window, previews }),
    peerPhoto: showPeerPhoto,
    node,
    context: () => ({
      selected,
      title: selected ? peerTitle(selected) : null,
      peers: directoryData.peers,
      session,
      calls: !!options.calls,
    }),
    visible: () => conversationVisible('[data-direct-conversation]'),
    signal: () => externalAbort.signal,
    attachments: composer.media,
    flush: transmit,
    forwarding: {
      contacts: () =>
        directoryData.peers
          .filter((peer) => !peer.localOnly)
          .map((peer) => ({
            id: peer.accountId,
            title: peerTitle(peer),
            seed: peer.address,
          })),
      profile: (id) => controller.knownProfile(id),
      more: () => directoryData.hasMore(navigator.onLine),
      loadMore: () => directoryData.refresh(true, navigator.onLine),
    },
    media: (view, thumbnail) => controller.media(view, thumbnail),
    run,
    older: {
      available: () =>
        !synchronization.openingRequested &&
        controller.olderAvailable(rootsShown()),
      load: loadOlder,
    },
    composerChanged: composerStatus,
    outgoing: () => outgoing.forPeer(selected?.accountId),
    retryOutgoing: () => {
      outgoing.retry();
      textQueue.retry();
    },
    ...(options.externalMedia ? { externalMedia: options.externalMedia } : {}),
    ...(options.representatives
      ? { representatives: options.representatives }
      : {}),
    actions: {
      action,
      picker: composer.picker,
      choose,
      forward,
      react: async (view, reaction) => {
        await controller.composeAction(
          view,
          'reaction',
          encodeDailyText({ text: reaction, reply: null, forwarded: false }),
        );
        await transmit();
      },
      remove: async (view) => {
        await controller.remove(view);
        await synchronizeVisible();
      },
    },
  });
  function invalidateGroupAuthority(event: LiveEvent): void {
    if (['invalidated', 'revoked', 'ended'].includes(event))
      groups.suspend(event === 'revoked' || event === 'ended');
  }
  function hideLiveHistory(event: LiveEvent): void {
    // Delivery/presence hints may come from the page being prepared. Let that
    // bounded page confirm and commit its cursor before the queued probe runs.
    if (event === 'changed') {
      controller.hint();
      return;
    }
    stopPreload();
    if (event === 'revoked' || event === 'ended') {
      composer.cancelRecording();
      composer.clearAttachment();
      playback.close();
    }
    if (['authorization', 'invalidated', 'revoked', 'ended'].includes(event))
      suspend('invalidate');
    else if (event === 'removed') {
      previews.clear();
      renderContacts();
      // Cancel the history token immediately without cancelling an in-flight
      // signed mutation (the sender receives its own deletion before its reply).
      controller.removed();
      groups.removed();
      menu.close();
      searchPanel.close();
    } else suspend();
  }
  async function checkVoiceAuthority(): Promise<void> {
    await playback.check((peer) => controller.playbackAllowed(peer));
    await composer.checkRecordingAuthority((peer) =>
      controller.playbackAllowed(peer),
    );
  }
  function node<T extends HTMLElement>(selector: string): T | null {
    return (
      mounted?.querySelector<T>(selector) ??
      directory?.querySelector<T>(selector) ??
      null
    );
  }
  function connected(): boolean {
    return !!directory?.isConnected;
  }
  function renderStatusMessage(): void {
    const immediate = node('[data-message-live]');
    if (immediate) immediate.textContent = live.notice;
    const retry = node('[data-message-refresh]');
    if (retry)
      retry.textContent = synchronization.failed
        ? t('Try again')
        : t('Sync now');
    renderChatStatus();
    const directoryStatus = node('[data-directory-status]');
    if (directoryStatus)
      directoryStatus.textContent = synchronization.failed ? message : '';
  }
  /** While an attachment is sent, the strip shows its ring instead of text. */
  function renderUploadStatus(text: HTMLElement): boolean {
    if (!synchronization.busy) uploading = null;
    if (uploading === null) return false;
    uploadIndicator.set(uploading);
    text.replaceChildren(uploadIndicator.element);
    const strip = text.closest<HTMLElement>('.chat-feedback');
    if (strip) strip.dataset['state'] = 'notice';
    return true;
  }
  function renderChatStatus(): void {
    const text = node('[data-message-status]');
    if (!text) return;
    if (renderUploadStatus(text)) return;
    const upToDate =
      !synchronization.failed && message === t('Conversations updated.');
    // Initial loading belongs to the selected history gate. Ordinary sends,
    // edits, removals and account maintenance must not announce another sync.
    text.textContent = upToDate ? '' : message;
    const strip = text.closest<HTMLElement>('.chat-feedback');
    if (strip) strip.dataset['state'] = upToDate ? 'ok' : 'notice';
  }
  function refreshDirectoryPreviews(): void {
    void previews.refresh(
      directoryData.peers
        .filter((peer) => !peer.localOnly)
        .map((peer) => peer.accountId),
    );
  }
  function announceSynchronized(): void {
    message = controller.synchronizationIssues.length
      ? t(
          'Some conversations need key recovery or renewed consent. Other conversations continue syncing.',
        )
      : controller.transportPending
        ? t('Some sends are still pending. They will resume automatically.')
        : t('Conversations updated.');
  }
  function status(): void {
    textQueue.resume();
    startupWarmup.resume();
    visits.resume();
    renderStatusMessage();
    menu.setBusy(synchronization.busy);
    const dailyStatus = settingsHost?.querySelector('[data-daily-status]');
    if (dailyStatus) dailyStatus.textContent = message;
    renderSoundSettings();
    for (const host of [mounted, directory])
      host
        ?.querySelectorAll<
          | HTMLButtonElement
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement
        >(
          'button:not([data-chat-back]):not([data-conversation]),input,select,textarea:not([data-message-text]):not([data-group-text])',
        )
        .forEach((control) => {
          control.disabled = synchronization.busy;
        });
    composer.update();
    groups.status();
  }
  function renderSoundSettings(): void {
    const toggle = settingsHost?.querySelector<HTMLButtonElement>(
      '[data-sound-toggle]',
    );
    if (toggle) {
      toggle.textContent = sound.enabled
        ? t('Disable sounds')
        : t('Enable sounds');
      toggle.setAttribute('aria-pressed', String(sound.enabled));
    }
    const notice = settingsHost?.querySelector('[data-sound-status]');
    if (notice)
      notice.textContent =
        sound.notice ||
        (sound.enabled
          ? t('Sounds enabled in this browser.')
          : t('Sounds disabled in this browser.'));
  }
  sound.observe(renderSoundSettings);
  sound.prepare();
  const soundEvents = new AbortController();
  document.addEventListener('pointerdown', () => sound.unlock(), {
    capture: true,
    signal: soundEvents.signal,
  });
  document.addEventListener('keydown', () => sound.unlock(), {
    capture: true,
    signal: soundEvents.signal,
  });
  window.addEventListener(
    'storage',
    (event) => {
      if (event.key === soundPreferenceKey || event.key === null)
        sound.reload();
    },
    { signal: soundEvents.signal },
  );
  function action(label: string, work: () => Promise<void>): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      void run(work);
    });
    return button;
  }
  async function run(work: () => Promise<void>): Promise<void> {
    await synchronization.run(work);
  }
  /** One page further back in the selected conversation, keeping what is
   * shown meanwhile; true when the window grew. */
  async function loadOlder(): Promise<boolean> {
    const peer = selected,
      shown = rootsShown();
    if (!peer || synchronization.openingRequested) return false;
    // A scroll is a selected-history request, not a disposable action while
    // another foreground operation owns the engine. Navigation cancels it.
    await synchronization.openOlder(async () => {
      if (selected !== peer) return;
      controller.requestOlder();
      if (peer.localOnly) await controller.openArchive(peer.accountId);
      else if (navigator.onLine)
        await synchronization.history(() =>
          controller.synchronize({ priority: 'interactive' }),
        );
      else await controller.openOffline(peer.accountId);
      await controller.savePins();
    });
    return selected === peer && rootsShown() > shown;
  }
  /** Opens a private-chat match at its message; other results open their conversation. */
  function openSearchResult(item: SearchItem, entry: ConversationEntry): void {
    const peer = directoryData.peers.find((p) => p.accountId === item.peer);
    if (!peer) {
      entry.open();
      return;
    }
    void requestPeer(peer).then(() => revealSearchMatch(item.id, peer));
  }
  async function revealSearchMatch(
    id: string,
    peer: ConversationPeer,
  ): Promise<void> {
    const open = () => selected?.accountId === peer.accountId;
    const found = await revealMessage(id, {
      row: (message) =>
        node('[data-message-history]')?.querySelector<HTMLElement>(
          `article[data-message="${CSS.escape(message)}"]`,
        ) ?? null,
      // A failed read counts as no progress, as in scroll-driven loading.
      older: {
        available: () => controller.olderAvailable(rootsShown()),
        load: () => loadOlder().catch(() => false),
      },
      valid: open,
    });
    if (!found && open())
      showToast(
        t('This message is further back. Scroll up to load earlier messages.'),
      );
  }
  function rootsShown(): number {
    return (rows ?? []).filter((row) => !row.relation && row.kind !== 'profile')
      .length;
  }
  function stopPreload(): void {
    synchronization.stopPreload();
  }
  function conversationVisible(selector = '.chat-panel'): boolean {
    return (
      document.visibilityState === 'visible' && conversationMounted(selector)
    );
  }
  function conversationMounted(selector: string): boolean {
    return !!mounted?.isConnected && !!node(selector)?.getClientRects().length;
  }
  function enterConversation(): void {
    navigatingToConversation = true;
    try {
      options.openConversation();
    } finally {
      navigatingToConversation = false;
    }
  }
  function requestRefresh(
    update: LiveUpdate = 'refresh',
    work: VaultWorkOptions = {},
  ): void {
    synchronization.request(update, work);
  }
  function renderHistory(update: HistoryUpdate = 'history'): void {
    historyUi.render(rows, update);
  }
  function choose(mode: 'reply' | 'edit', view: MessageView): void {
    composer.choose(mode, view, rows ?? []);
  }
  function clearSessionPanels(): void {
    mounted?.querySelectorAll('form').forEach((form) => form.reset());
    node('[data-representative-chat]')?.replaceChildren();
    node('[data-message-pending]')?.replaceChildren();
    composer.setPeer(null);
  }
  async function sendPending(work: VaultWorkOptions = {}): Promise<void> {
    outgoing.beginTransfer();
    try {
      await controller.sendPending(work);
    } catch (error: unknown) {
      outgoing.failTransfer();
      renderHistory();
      throw error;
    }
  }
  async function transmit(): Promise<void> {
    if (navigator.onLine) {
      await sendPending();
      if (
        !(await synchronizeVisible({ priority: 'interactive' }, () =>
          controller.savePins(),
        ))
      )
        return;
    }
  }
  async function forward(
    view: DailyView<MessageView>,
    peer: string,
  ): Promise<void> {
    if (!directoryData.peers.some((p) => p.accountId === peer && !p.localOnly))
      throw new Error('Select an approved contact to forward to.');
    if (view.kind === 'text')
      await controller.compose(
        peer,
        encodeDailyText({ ...view.content, reply: null, forwarded: true }),
      );
    else if (view.kind === 'attachment') {
      const content = attachmentContent(JSON.parse(view.text) as unknown),
        bytes = await controller.media(view, false);
      let thumbnail: Uint8Array<ArrayBuffer> | null = null;
      try {
        if (content.thumbnail) thumbnail = await controller.media(view, true);
        await controller.composeAttachment(
          peer,
          {
            name: content.name,
            type: content.type,
            image: content.image,
            ...(content.voice ? { voice: content.voice } : {}),
            bytes,
            thumbnail,
          },
          encodeDailyText({
            text: view.content.text,
            reply: null,
            forwarded: true,
          }),
        );
      } finally {
        bytes.fill(0);
        thumbnail?.fill(0);
      }
    }
  }
  function sameSession(value: AccountSession | null): boolean {
    return (
      value?.accountId === session?.accountId &&
      value?.deviceId === session?.deviceId &&
      value?.csrf === session?.csrf
    );
  }
  async function renderPending(): Promise<void> {
    const list = node('[data-message-pending]');
    if (!list) return;
    const expected = generation,
      peer = selected?.accountId,
      revision = ++pendingRender;
    const current = () =>
      expected === generation &&
      revision === pendingRender &&
      peer === selected?.accountId &&
      list === node('[data-message-pending]');
    const pending = await controller.pending();
    if (!current()) return;
    list.replaceChildren(
      ...pending
        .filter(
          (item) => item.peer === peer && !item.text && !outgoing.has(item.id),
        )
        .map((item) =>
          pendingBubble(
            action(t('Delete send'), async () => {
              await controller.discard(item.id);
            }),
          ),
        ),
    );
    if (!peer || rows === null) return;
    const restored = await outgoing.restorePending({
      peer,
      pending,
      verified: rows,
      current: () => current() && rows !== null,
      read: (ids) => controller.pendingTexts(peer, ids),
    });
    if (restored) renderHistory();
  }
  function reportTextSaveError(error: unknown): void {
    message =
      error instanceof Error
        ? translatedError(error.message)
        : t('Could not complete the operation.');
    status();
  }
  function canQueueText(): boolean {
    return (
      !!selected &&
      !selected.localOnly &&
      rows !== null &&
      !continuity.suspended &&
      composer.acceptsQueuedText
    );
  }
  function queueText(): boolean {
    if (!canQueueText() || !selected) return false;
    const peer = selected.accountId;
    try {
      return composer.queueText((text, reply) =>
        textQueue.enqueue({
          id: crypto.randomUUID(),
          peer,
          text: encodeDailyText({ text, reply, forwarded: false }),
        }),
      );
    } catch (error: unknown) {
      reportTextSaveError(error);
      return true;
    }
  }
  function organizationIds(): string[] {
    return [
      ...directoryData.peers.map((p) => p.accountId),
      ...agenda.ids,
      ...groups.entries.map((g) => g.state.groupId),
    ];
  }
  function performDirectoryAction(work: () => Promise<void>): void {
    const expected = generation;
    void run(async () => {
      if (expected !== generation) throw new Error('Session changed.');
      await work();
      if (expected !== generation) throw new Error('Session changed.');
      renderContacts();
    });
  }
  function contactActions(
    contact: AddressBookEntry,
    settingsId: string,
    mutePeer: string | null,
  ): ConversationAction[] {
    const favoriteId = agenda.id(contact),
      perform = performDirectoryAction;
    return [
      ...organizationActions({
        daily,
        settingsId,
        favoriteId,
        mutePeer,
        perform,
      }),
      {
        id: 'block',
        label: t('Block contact'),
        icon: 'block',
        perform: () =>
          perform(async () => {
            const expected = generation;
            if (composer.recording || composer.voicePreview)
              throw new Error(
                'Send or remove the voice preview before blocking the contact.',
              );
            await contacts.snapshot();
            if (expected !== generation) throw new Error('Session changed.');
            await contacts.block(contact, true);
            if (expected !== generation) throw new Error('Session changed.');
            if (
              selected?.ecosystem === contact.ecosystem &&
              selected.address === contact.address
            ) {
              selected = null;
              controller.select(null);
              composer.clearContext();
            }
            await refresh();
          }),
      },
      {
        id: 'remove',
        label: t('Remove contact'),
        icon: 'remove',
        perform: () =>
          perform(async () => {
            const expected = generation;
            await sync.refresh();
            if (expected !== generation) throw new Error('Session changed.');
            await agenda.remove(contact);
          }),
      },
    ];
  }
  function renderContacts(): void {
    directoryUi.renderContacts();
  }
  function reopenSelectedPeer(peer: ConversationPeer): boolean {
    if (
      selected?.accountId !== peer.accountId ||
      rows === null ||
      synchronization.failed
    )
      return false;
    showDirectConversation();
    enterConversation();
    return true;
  }
  function reusePeer(peer: ConversationPeer): boolean {
    if (composer.recording || composer.voicePreview)
      traceChatSync(controller, peer.accountId, {
        event: 'navigation',
        reason: 'voice-preview',
      });
    return !composer.recording && !composer.voicePreview && visits.open(peer);
  }
  function requestPeer(peer: ConversationPeer): Promise<void> {
    if (reopenSelectedPeer(peer)) return Promise.resolve();
    if (reusePeer(peer)) return Promise.resolve();
    const current = generation;
    const clear = directoryUi.openingPeer(peer.accountId);
    return synchronization
      .open(
        async () => {
          clear();
          if (current === generation && !continuity.suspended)
            await openPeer(peer);
        },
        () =>
          current === generation && !continuity.suspended && reusePeer(peer),
      )
      .finally(() => {
        clear();
        broadcastProfile();
      });
  }
  async function openPeer(peer: ConversationPeer): Promise<void> {
    if (
      (composer.recording || composer.voicePreview) &&
      selected?.accountId !== peer.accountId
    )
      throw new Error(
        'Send or remove the voice preview before changing recipients.',
      );
    selectPeer(peer);
    if (!navigator.onLine) {
      await controller.openOffline(peer.accountId);
      return;
    }
    if (peer.localOnly) {
      await controller.openArchive(peer.accountId);
      return;
    }
    if (visits.restore()) return;
    await synchronizeVisible({ priority: 'interactive' }, async () => {
      await controller.savePins();
      await historyUi.markRead(daily);
    });
    // Opening one conversation only needs its read receipts. Account-wide
    // presence, push settings and peer states keep their periodic lifecycle.
  }
  function selectPeer(peer: ConversationPeer): void {
    synchronization.cancelOpening();
    showDirectConversation();
    enterConversation();
    composer.clearContext();
    if (selected?.accountId !== peer.accountId)
      resetHistoryPosition(node('[data-message-history]'));
    selected = peer;
    renderContacts();
    mountRepresentativeChat(peer);
    composer.setPeer(peer.accountId);
    controller.select(peer.accountId);
    renderHistory();
    // Pending bubbles belong to the open conversation only; a failed local
    // read keeps the previous list until the next send or synchronization.
    renderPending().catch(() => undefined);
  }
  function mountRepresentativeChat(peer: ConversationPeer): void {
    const representativePanel = node('[data-representative-chat]');
    representativePanel?.replaceChildren();
    if (representativePanel && !peer.localOnly)
      options.representatives?.mountChat(
        representativePanel,
        peer,
        async (text) => {
          if (selected?.accountId !== peer.accountId)
            throw new Error('Conversation changed.');
          await controller.compose(peer.accountId, text);
          await transmit();
        },
      );
  }
  function showDirectConversation(): void {
    groups.deselect();
    const direct = node('[data-direct-conversation]');
    if (direct) direct.hidden = false;
  }
  function renderPresence(): void {
    const presence = node('[data-peer-presence]'),
      state = selected ? states.get(selected.accountId) : null;
    if (!presence) return;
    const text = presenceText(state);
    presence.classList.toggle('peer-address', text === null);
    // Without shared presence the subtitle identifies a named wallet instead of stating an absence.
    presence.textContent =
      text ?? (selected?.name ? shortAddress(selected.address) : '');
  }
  function presenceText(state: PeerState | null | undefined): string | null {
    if (state?.online) return t('Online');
    return null;
  }
  function contactsMore(): void {
    const button = node('[data-message-more-contacts]');
    if (button)
      button.hidden =
        !directoryData.hasMore(navigator.onLine) && groups.next === null;
  }
  async function refreshContacts(
    more = false,
    work: VaultWorkOptions = {},
  ): Promise<void> {
    await directoryData.refresh(more, true, work);
    contactsMore();
  }
  async function refreshLocalContacts(more = false): Promise<void> {
    await directoryData.refresh(more, false);
    if (session) await groups.refresh(more);
    else await daily.loadSettings(organizationIds());
    renderContacts();
    contactsMore();
    if (selected && conversationVisible('[data-direct-conversation]'))
      await controller.openOffline(selected.accountId);
  }
  async function refresh(requested: VaultWorkOptions = {}): Promise<void> {
    synchronization.startRefresh();
    const current = generation;
    const initialWork = startupWarmup.initialWork(
      document.visibilityState === 'visible',
    );
    const work: VaultWorkOptions = { ...initialWork, ...requested };
    try {
      await loadMessageDirectory({
        loadVault: () => controller.synchronizeIdentities(work),
        loadContacts: () => refreshContacts(false, work),
        loadPins: () => controller.loadSynchronizedPins(work),
        guard: () => {
          if (current !== generation) throw new Error('Session changed.');
        },
      });
      if (!synchronization.openingRequested) await refreshSelected(requested);
      await controller.savePins(work);
      startupWarmup.request();
      if (
        session &&
        navigator.onLine &&
        (document.visibilityState === 'visible' || playback.open)
      )
        live.start();
    } catch (error: unknown) {
      if (current === generation) {
        controller.hideFailedRead(error);
        options.directorySettled?.(session);
      }
      throw error;
    }
  }
  async function refreshChangedSelected(
    work: VaultWorkOptions = {},
    scope: ChangeFollowupScope = 'all',
  ): Promise<void> {
    if (groups.selected) return groups.changed(scope);
    const peer = selected;
    if (!peer || !conversationMounted('[data-direct-conversation]')) return;
    if (peer.localOnly) return refreshSelected();
    const changed = await controller.probe(work);
    if (selected !== peer || !conversationMounted('[data-direct-conversation]'))
      return;
    await applyProbe(changed, work);
  }
  /** Ordinary appends reach the open window through the account receiver.
   * Removals, authority changes and a window the receiver passed need the
   * selected history read; it is never the routine path for new messages. */
  async function applyProbe(
    changed: boolean,
    work: VaultWorkOptions,
  ): Promise<void> {
    if (changed && controller.handOffAdvance())
      synchronization.receive('direct');
    else if (changed) {
      synchronization.prepareHistory('direct');
      await synchronization.history(
        () => controller.synchronize(work),
        () => controller.savePins(work),
      );
      return;
    }
    await controller.savePins(work);
  }
  async function refreshSelected(work: VaultWorkOptions = {}): Promise<void> {
    if (!selected || !conversationMounted('[data-direct-conversation]')) return;
    if (selected.localOnly) {
      await controller.openArchive(selected.accountId);
      return;
    }
    await synchronizeVisible(work);
  }
  async function synchronizeVisible(
    work: VaultWorkOptions = { priority: 'interactive' },
    settled?: () => Promise<void>,
  ): Promise<boolean> {
    if (!conversationMounted('[data-direct-conversation]')) return true;
    if (await controller.probe(work)) {
      await controller.loadPins(work);
      return synchronization.history(
        () => controller.synchronize(work),
        settled,
      );
    }
    await settled?.();
    return true;
  }
  async function submit(): Promise<void> {
    if (selected?.localOnly)
      throw new Error(
        'Ask your contact for permission to send new messages. Your saved history remains available.',
      );
    // Files chosen together leave one by one, each sent before the next is
    // staged, so they arrive in the order they were chosen.
    do {
      if (!(await composer.save(selected?.accountId ?? null))) return;
      await renderPending();
      if (navigator.onLine) await sendPending();
    } while (composer.hasAttachment);
    if (navigator.onLine)
      await synchronizeVisible({ priority: 'interactive' }, () =>
        controller.savePins(),
      );
    if (startupWarmup.pending) await historyUi.markRead(daily);
    else await dailyTick();
  }
  /** The message carries only the KLIPY link, inside the usual E2EE text. */
  async function sendGif(url: string): Promise<void> {
    await composer.saveGif(
      selected?.accountId ?? null,
      !!selected?.localOnly,
      url,
    );
    await renderPending();
    if (navigator.onLine) {
      await sendPending();
      await synchronizeVisible();
    }
  }
  async function dailyTick(): Promise<void> {
    if (!session || !navigator.onLine) return;
    const current = generation;
    await activity.refresh();
    if (current !== generation || !connected()) return;
    await pushSettings?.refresh();
    await daily.configure(preferences());
    await daily.heartbeat(document.visibilityState === 'visible');
    if (current !== generation || !connected()) return;
  }
  async function searchPage(
    query: string,
    after: string | null,
  ): Promise<SearchPage> {
    if (synchronization.busy)
      throw new Error('Wait for conversations to update, then try again.');
    let result: SearchPage | null = null;
    const search = async () => {
      const page = await controller.search(query, after);
      result = {
        ...page,
        next: page.next ?? (groups.entries.length ? 'groups:' : null),
      };
    };
    await awaitMessageWork(
      async () => {
        if (after?.startsWith('groups:')) {
          const page = await groups.search(
            query,
            after.slice('groups:'.length) || null,
          );
          result = {
            ...page,
            next: page.next === null ? null : 'groups:' + page.next,
          };
          return;
        }
        if (!navigator.onLine) return search();
        await controller.initialize();
        return afterMessageWork(() => controller.synchronize(), search);
      },
      (work) =>
        synchronization.run(async () => {
          await synchronization.history(work);
        }),
    );
    if (!result) throw new Error(message);
    return result;
  }
  function releaseConversation(reason: 'pause' | 'directory'): void {
    directoryUi.pause();
    externalAbort.abort();
    historyUi.clearMedia();
    externalAbort = new AbortController();
    suspend(reason);
    groups.leave();
    composer.pause();
    synchronization.resume();
  }
  function suspend(
    reason: 'pause' | 'invalidate' | 'directory' = 'pause',
  ): void {
    visits.reset();
    synchronization.cancelOpening();
    if (reason !== 'directory') previews.clear();
    renderContacts();
    stopPreload();
    menu.close();
    composer.closePicker();
    if (reason === 'invalidate') controller.close();
    else controller.pause(reason === 'directory' ? 'conversation' : 'account');
    groups.suspend();
    rows = null;
    // Returning to the list keeps the last search; account changes clear it.
    if (reason === 'directory') searchPanel.hide();
    else searchPanel.close();
    renderHistory();
  }
  function attachmentProgress(progress: { done: number; total: number }): void {
    if (!synchronization.busy || !mounted?.isConnected) return;
    uploading = progress.total ? progress.done / progress.total : 0;
    message = t(
      'Uploading attachment: part {0} of {1}. Closing the app pauses the transfer; the encrypted draft is preserved.',
      [progress.done, progress.total],
    );
    status();
  }
  /** Typed text is not stored anywhere, so leaving the page asks first. */
  function unsentWork(): boolean {
    return (
      composer.recording ||
      composer.voicePreview ||
      textQueue.unsaved ||
      composer.text.trim() !== ''
    );
  }
  function beforeUnload(event: BeforeUnloadEvent): void {
    if (!unsentWork()) return;
    event.preventDefault();
    event.returnValue = '';
  }
  function offline(): void {
    live.stop();
    suspend();
    message = t('Offline. Saved history remains available on this device.');
    void run(refreshLocalContacts);
    status();
  }
  function online(): void {
    if (session && (document.visibilityState === 'visible' || playback.open))
      live.start();
    suspend();
    requestRefresh();
  }
  function visibilityChanged(): void {
    const visible = document.visibilityState === 'visible',
      current = generation;
    if (!visible && composer.recording)
      void composer.stopRecording(
        t(
          'The browser interrupted recording. Check the preserved excerpt when you return.',
        ),
      );
    continuity.visibility(visible);
    synchronization.resume({ priority: 'interactive' });
    void daily.heartbeat(visible).catch(() => {
      if (current !== generation) return;
      message = t(
        'Could not update presence. Online status will stop after the activity timeout.',
      );
      status();
    });
    if (!visible || !session || !navigator.onLine) return;
    broadcastProfile();
    historyUi.resume();
    if (groups.selected) requestRefresh('probe');
    void historyUi.markRead(daily).catch((error: unknown) => {
      if (current !== generation) return;
      suspend('invalidate');
      message =
        error instanceof Error
          ? error.message
          : t('Could not verify read receipts.');
      status();
    });
  }
  function controlsChanged(): void {
    suspend('invalidate');
    requestRefresh();
  }
  function devicesChanged(): void {
    suspend('invalidate');
    void checkVoiceAuthority();
  }
  function historyImported(): void {
    controller.hide();
    synchronization.prepareHistory();
    groups.historyChanged();
    if (mounted?.isConnected && !synchronization.busy)
      void run(navigator.onLine ? refresh : refreshLocalContacts);
  }
  async function groupTick(): Promise<void> {
    if (!mounted?.isConnected) return;
    if (!live.current) await groups.refresh();
    if (conversationVisible('[data-group-conversation]'))
      await groups.resumePending();
  }
  async function periodicMessages(): Promise<void> {
    await groupTick();
    if (
      !conversationMounted('[data-direct-conversation]') ||
      !selected ||
      selected.localOnly
    )
      return;
    await synchronization.resumePending();
    if (!live.current && (await controller.probe())) {
      if (!conversationMounted('[data-direct-conversation]')) return;
      synchronization.prepareHistory();
      if (!(await synchronization.history(() => controller.synchronize())))
        return;
      await controller.savePins();
    }
  }
  async function periodicMessageWork(): Promise<boolean> {
    if (!live.current) return true;
    if (
      conversationVisible('[data-group-conversation]') &&
      (await groups.pendingWork())
    )
      return true;
    return synchronization.pendingWork();
  }
  function preferencesChanged(): void {
    if (!startupWarmup.ready || startupWarmup.pending) return;
    if (!synchronization.busy && session && navigator.onLine)
      void synchronization.maintainPresence();
    broadcastProfile();
  }
  /** Background round; a failure is retried by the next tick or profile save. */
  function broadcastProfile(): void {
    const peer =
      selected && !selected.localOnly ? selected.accountId : undefined;
    profileBroadcast.run(peer).catch(() => undefined);
  }
  function pageHide(event: PageTransitionEvent): void {
    continuity.freeze();
    synchronization.reset();
    startupWarmup.pause();
    if (composer.recording)
      void composer.stopRecording(
        t(
          'The browser interrupted recording. Check the preserved excerpt when you return.',
        ),
      );
    if (!event.persisted) {
      textQueue.reset();
      outgoing.reset();
      startupWarmup.reset();
      composer.dispose();
      groups.suspend(true);
      playback.close();
      synchronization.close();
      soundEvents.abort();
      void sound.dispose().catch(() => {
        message = t('Could not stop audio in this browser.');
        status();
      });
    }
    suspend(event.persisted ? 'pause' : 'invalidate');
  }
  function pageShow(event: PageTransitionEvent): void {
    if (event.persisted) continuity.resume();
  }
  bindMessageLifecycle({
    offline,
    online,
    visibility: visibilityChanged,
    freeze: () => continuity.freeze(),
    resume: () => continuity.resume(),
    controls: controlsChanged,
    devices: devicesChanged,
    imported: historyImported,
    preferences: preferencesChanged,
    tick: () => {
      continuity.changed();
      broadcastProfile();
      return synchronization.periodicTick();
    },
    progress: attachmentProgress,
    beforeUnload,
    pageHide,
    pageShow,
  });
  function bind(selector: string, handler: () => void): void {
    node(selector)?.addEventListener('click', handler);
  }
  async function moreConversations(): Promise<void> {
    await refreshContacts(true);
    if (groups.next !== null) await groups.refresh(true);
    else await daily.loadSettings(organizationIds());
    renderContacts();
    contactsMore();
  }
  function bindMessageControls(): void {
    bind('[data-message-refresh]', () => {
      if (synchronization.resumeHistory()) return;
      if (live.connected) {
        void run(() => refresh({ priority: 'interactive' }));
        return;
      }
      if (session && navigator.onLine) live.retry();
      requestRefresh();
    });
    bind('[data-message-more-contacts]', () => {
      void run(() =>
        navigator.onLine ? moreConversations() : refreshLocalContacts(true),
      );
    });
    node<HTMLFormElement>('[data-message-form]')?.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        if (!queueText()) void run(submit);
      },
    );
  }
  function mountGroups(container: HTMLElement): void {
    const panel = container.querySelector<HTMLElement>(
        '[data-group-conversation]',
      ),
      sidebar = node('[data-group-sidebar]');
    if (panel && sidebar) groups.mount(panel, sidebar);
    const direct = node('[data-direct-conversation]');
    if (direct) direct.hidden = !!groups.selected;
  }
  return {
    createGroup: () => groups.create(),
    joinGroup: (url = '') => groups.join(url),
    groupInvites: () => groups.invites(),
    respondGroupInvite: (id: string, accept: boolean) =>
      groups.respondInvite(id, accept),
    /** Private contact photos for other views, from cards already verified on this device. */
    peerPhoto: (host: HTMLElement, peer: string, signal: AbortSignal) =>
      showPeerPhoto(host, peer, signal),
    statusesChanged(authors: ReadonlySet<string>): void {
      statusAuthors = authors;
      renderContacts();
    },
    async openContact(peer: Peer): Promise<void> {
      await requestPeer(peer);
    },
    async contactSaved(contact: AddressBookEntry): Promise<void> {
      await agenda.saved(contact);
      renderContacts();
    },
    prepareCall(): void {
      if (composer.recording)
        throw new Error(
          'Stop or cancel voice recording before starting or answering a call. The preview remains available.',
        );
    },
    callLabel: (peer: string) =>
      directoryData.peers.find((p) => p.accountId === peer)?.name ||
      directoryData.peers.find((p) => p.accountId === peer)?.address ||
      t('Approved contact {0}', [peer.slice(0, 8)]),
    openSearch: () => searchPanel.open(),
    applyPrivacy: (preferences: DailyPreferences) =>
      daily.configure(preferences),
    setSession(value: AccountSession | null): void {
      if (sameSession(value)) {
        session = value;
        controller.setSession(value);
        daily.setSession(value);
        groups.setSession(value);
        return;
      }
      generation++;
      visits.reset();
      textQueue.reset();
      outgoing.reset();
      continuity.reset();
      previews.clear();
      historyUi.clear();
      externalAbort.abort();
      externalAbort = new AbortController();
      directoryData.clear();
      menu.reset();
      directoryUi.reset();
      searchPanel.close();
      composer.cancelRecording();
      playback.close();
      live.stop();
      composer.resetPicker();
      synchronization.reset();
      startupWarmup.reset();
      session = value;
      contacts.setSession(value);
      daily.setSession(value);
      pushSettings?.reset();
      controller.setSession(value);
      groups.setSession(value);
      selected = null;
      states.clear();
      composer.clearContext();
      composer.clearAttachment();
      clearSessionPanels();

      message = value
        ? t('Open and sync contacts to start chatting.')
        : t('Sign in and authorize this device to chat.');
      renderContacts();
      renderHistory();
      status();
    },
    ready(): void {
      if (selected) mountRepresentativeChat(selected);
      if (session && navigator.onLine && document.visibilityState === 'visible')
        live.start();
      if (!navigatingToConversation && session && navigator.onLine)
        requestRefresh();
    },
    /** App-tab return: the directory is still live and loaded. Only the
     * selected history needs its normal authorization/snapshot check. */
    resume(): void {
      if (!session || !navigator.onLine) return;
      live.start();
      if (!navigatingToConversation)
        void synchronization.open(() =>
          groups.selected ? groups.refresh() : refreshSelected(),
        );
      synchronization.resume();
    },
    canActivate: () =>
      !synchronization.busy && !unsentWork() && groups.canActivate(),
    // In-app navigation closes/rechecks history, while keeping the directory
    // previews that are already retained when the conversation is hidden.
    leave: () => releaseConversation('directory'),
    viewChanged(): void {
      if (!conversationVisible()) releaseConversation('directory');
      else this.ready();
    },
    mountSettings(container: HTMLElement): void {
      settingsHost = container;
      container.innerHTML = notificationSettings;
      const on = (selector: string, work: () => Promise<void>) =>
        container.querySelector(selector)?.addEventListener('click', () => {
          void run(work);
        });
      pushSettings = mountPushSettings(
        container.querySelector<HTMLElement>('[data-push-settings]')!,
        daily,
      );
      on('[data-push-enable]', () => daily.enablePush());
      on('[data-push-disable]', () => daily.disablePush());
      on('[data-sound-toggle]', async () => {
        await sound.setEnabled(!sound.enabled);
        try {
          await savePushSoundPreference(sound.enabled);
        } catch {
          throw new Error(
            'Sound changed in the interface, but the push preference was not saved. System notification silence cannot be guaranteed.',
          );
        }
      });
      status();
    },
    mount(container: HTMLElement, directoryHost: HTMLElement): void {
      directoryUi.pause();
      mounted = container;
      directory = directoryHost;
      container.innerHTML = directChat();
      composer.mount(container);
      bindChatOptions(container);
      mountGroups(container);
      directoryUi.bind();
      bindMessageControls();
      renderContacts();
      renderHistory();
      status();
      if (session && navigator.onLine) {
        live.start();
        requestRefresh();
      } else if (!navigator.onLine) void run(refreshLocalContacts);
    },
  };
}

export type { MessageItem } from './history.ts';
export { Messages } from './controller.ts';
export type { MessageView } from './controller.ts';

/** Legacy media/control sends keep their existing discardable progress row. */
function pendingBubble(discard: HTMLButtonElement): HTMLLIElement {
  const li = document.createElement('li'),
    dots = document.createElement('span'),
    label = document.createElement('span');
  li.className = 'chat-pending-bubble';
  dots.className = 'chat-pending-dots';
  dots.setAttribute('aria-hidden', 'true');
  dots.append(...[0, 1, 2].map(() => document.createElement('i')));
  label.className = 'chat-pending-label';
  label.textContent = t('message.sending');
  discard.className = 'chat-pending-discard';
  discard.setAttribute('aria-label', discard.textContent ?? '');
  discard.title = discard.textContent ?? '';
  discard.textContent = '×';
  li.append(dots, label, discard);
  return li;
}
