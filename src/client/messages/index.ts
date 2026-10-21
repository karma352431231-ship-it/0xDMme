export { notificationMessages } from './notification.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { MessageContinuity } from './continuity.ts';
import { loadMessageDirectory } from './startup.ts';
import { MessageSynchronization } from './synchronization.ts';
import { MessageLiveUpdates } from './live-updates.ts';
import { SelectedPreviewAdmission } from './preview-admission.ts';
import { ConversationActivity } from './activity.ts';
import { MessageWarmup } from './warmup.ts';
import { ConnectedConversationVisits } from './visits.ts';
import { traceChatSync } from '../chat-sync-diagnostics/index.ts';
import { publishVerifiedConversationPreview } from './verified-previews.ts';
import { TextSendQueue } from './text-send.ts';
import { OutgoingTexts } from './outgoing-text.ts';
import { MessageHistoryUi } from './history-ui.ts';
import { bindMessageLifecycle } from './lifecycle.ts';
import {
  directChat,
  bindChatComposer,
  bindChatOptions,
  updateChatComposer,
  resetHistoryPosition,
  bindRecordGesture,
  showRecording,
} from '../chat-ui/index.ts';
import { shortAddress } from '../appearance/index.ts';
import type { HistoryUpdate } from '../message-visibility/index.ts';
import { mountPushSettings } from '../push-settings/index.ts';
import { notificationSettings } from './settings.ts';
import { ConversationSearch } from './search.ts';
import type { SearchPage } from './search.ts';
import type { ConversationAction } from './directory.ts';
import { ConversationMenu } from './directory-menu.ts';
import { ContactDirectory, Contacts } from '../contacts/index.ts';
import { organizationActions } from './directory-actions.ts';
import { startGroups } from '../groups/index.ts';
import type { startRepresentatives } from '../representatives/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import { VoiceRecording } from '../voice-recording/index.ts';
import { AttachmentUi } from '../attachment-ui/index.ts';
import type { LiveEvent } from '../message-live/index.ts';
import { LiveMessages } from '../message-live/index.ts';
import type { LiveUpdate } from '../message-live/index.ts';
import { Daily } from '../daily/index.ts';
import type { PeerState } from '../daily/index.ts';
import { dailyViews } from '../daily-text/index.ts';
import type { DailyView } from '../daily-text/index.ts';
import { GifSearch, gifMessageUrl, mountGifPane } from '../gif-search/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { EmojiPicker, emojiIntoComposer } from '../emoji/index.ts';
import {
  NotificationSound,
  soundPreferenceKey,
  savePushSoundPreference,
} from '../notification-sound/index.ts';
import { encodeDailyText, decodeDailyText } from '../../shared/daily/index.ts';
import type { DailyPreferences } from '../../shared/daily/index.ts';
import {
  attachmentContent,
  chatFileLimit,
} from '../../shared/attachments/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { Peer, AddressBookEntry } from '../../shared/contacts/index.ts';
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
export function startMessages(
  access: VaultAccess,
  sync: VaultSync,
  options: {
    externalMedia?: ExternalMediaConsent;
    calls?: { start: (peer: string) => Promise<void>; active: () => boolean };
    playback: VoicePlayback;
    openConversation: () => void;
    openContact: (contact: AddressBookEntry) => void;
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
    attachments = new AttachmentUi(playback, voiceStatus, chatFileLimit),
    daily = new Daily(access, sync);
  const sound = new NotificationSound();
  const agenda = new ContactDirectory(sync),
    menu = new ConversationMenu();
  const emojiPicker = new EmojiPicker();
  // Accounts with an active status, from the status list the app already loads.
  let statusAuthors: ReadonlySet<string> = new Set();
  let externalAbort = new AbortController();
  const gifs = new GifSearch(
    () =>
      options.externalMedia?.authorize('gifs', externalAbort.signal) ??
      Promise.resolve(false),
    () =>
      AbortSignal.any([
        externalAbort.signal,
        ...(options.externalMedia ? [options.externalMedia.signal] : []),
      ]),
  );
  let states = new Map<string, PeerState>();
  let composing: { mode: 'reply' | 'edit'; view: MessageView } | null = null;
  let focusRequested = false;
  let navigatingToConversation = false;
  let directory: HTMLElement | null = null;
  const searchPanel = new ConversationSearch(searchPage);
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
  let recordingPeer: string | null = null;
  const voice = new VoiceRecording({
    changed: () => voiceStatus(),
    completed: (selection) => {
      if (!session || !recordingPeer || selected?.accountId !== recordingPeer) {
        selection.bytes.fill(0);
        return;
      }
      attachments.selectVoice(selection, recordingPeer);
      voiceStatus();
    },
  });
  function voiceStatus(): void {
    showRecording(node('[data-message-form]'), voice.state);
    composerStatus();
    voiceButtons();
    voiceFiles();
  }
  function composerStatus(): void {
    updateChatComposer(node('[data-message-form]'), {
      blocked: synchronization.busy || rows === null || !selected,
      textSendBlocked: canQueueText() ? textQueue.full : undefined,
      recording: voice.active,
      attachment: attachments.selected !== null,
    });
    focusComposer();
  }
  function focusComposer(): void {
    const input = node<HTMLTextAreaElement>('[data-message-text]');
    if (!focusRequested || !input || input.disabled) return;
    focusRequested = false;
    input.focus();
  }
  function voiceButtons(): void {
    const start = node<HTMLButtonElement>('[data-voice-record]');
    if (start)
      start.disabled =
        synchronization.busy ||
        rows === null ||
        voice.active ||
        attachments.selected !== null ||
        !selected ||
        !!options.calls?.active();
    const stop = node<HTMLButtonElement>('[data-voice-stop]');
    if (stop) {
      stop.hidden = !voice.active;
      stop.disabled = voice.state.phase === 'stopping';
    }
    const cancel = node<HTMLButtonElement>('[data-voice-cancel]');
    if (cancel) cancel.hidden = !voice.active;
  }
  function voiceFiles(): void {
    const file = node<HTMLInputElement>('[data-attachment-file]');
    if (file)
      file.disabled =
        synchronization.busy ||
        rows === null ||
        voice.active ||
        !!attachments.selected?.voice;
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
    (value) => {
      outgoing.acknowledge(value);
      renderHistory();
    },
  );
  const previews = new ConversationPreviewLoader({
    load: (peers) => controller.directoryPreviews(peers),
    changed: renderContacts,
    available: () =>
      !!session &&
      navigator.onLine &&
      !continuity.suspended &&
      !textQueue.pending &&
      !synchronization.visibleUpdatePending &&
      !synchronization.busy,
    exclude: () =>
      previewAdmission.exclude(
        selected?.accountId ?? null,
        conversationVisible('[data-direct-conversation]'),
      ),
  });
  const groups = startGroups(access, sync, {
    externalMedia: options.externalMedia,
    playback,
    daily,
    run,
    changed: () => renderContacts(),
    peers: () => directoryData.peers.filter((p) => !p.localOnly),
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
    previous: () => states,
    publish: (next) => {
      states = next;
      renderContacts();
    },
    alert: () => sound.alert('direct'),
  });
  function selectGroup(): void {
    if (voice.active || attachments.selected?.voice)
      throw new Error(
        'Send or remove the voice preview before changing conversations.',
      );
    selected = null;
    enterConversation();
    clearContext();
    attachments.clearSelection();
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
    hint: () => controller.hint(),
    request: (update, work, scope) =>
      synchronization.request(update, work, scope),
    inbox: (scope) => synchronization.requestInbox(scope),
    projection: (work) => synchronization.requestProjection(work),
    previews: () => {
      void previews.refresh(
        directoryData.peers
          .filter((peer) => !peer.localOnly)
          .map((peer) => peer.accountId),
      );
    },
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
    status,
    visibleSettled: () => previews.resume(),
    notice: (value) => {
      message = value;
    },
    complete: () => {
      if (!startupWarmup.pending && !textQueue.pending)
        void previews.refresh(
          directoryData.peers
            .filter((peer) => !peer.localOnly)
            .map((peer) => peer.accountId),
        );
      message = controller.transportPending
        ? t('Some sends are still pending. They will resume automatically.')
        : t('Conversations updated.');
    },
    renderPending,
    pause: () => {
      controller.pauseSynchronization();
      groups.pauseSynchronization();
    },
    preloadDirect: (signal) => controller.synchronizeAll(signal),
    preloadGroups: (signal) => groups.synchronizeAll(signal),
    unread: () => activity.refresh(),
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
    available: () => synchronization.foregroundReady && !textQueue.pending,
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
    readConfirmed: async (peer) => {
      const current = generation;
      const state = await daily.state(peer);
      if (current !== generation) return;
      states.set(peer, state);
      renderContacts();
    },
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
    attachments,
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
      picker: emojiPicker,
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
      voice.cancel();
      attachments.clearSelection();
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
    if (voice.active && recordingPeer) {
      try {
        if (!(await controller.playbackAllowed(recordingPeer)))
          await voice.stop(
            t(
              'This conversation was blocked. The excerpt is preserved only as a local preview.',
            ),
          );
      } catch {
        /* Revocation/session termination has its own immediate lifecycle event. */
      }
    }
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
      !synchronization.busy &&
      !synchronization.failed &&
      message === t('Conversations updated.');
    text.textContent = synchronization.busy
      ? t('Syncing…')
      : upToDate
        ? t('Updated')
        : message;
    // The desktop workspace hides the strip while everything is up to date.
    const strip = text.closest<HTMLElement>('.chat-feedback');
    if (strip) strip.dataset['state'] = upToDate ? 'ok' : 'notice';
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
    voiceStatus();
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
  function compositionText(view: MessageView): string {
    return (
      dailyViews(rows ?? []).find((v) => v.id === view.id)?.content.text ??
      decodeDailyText(view.text).text
    );
  }
  function choose(mode: 'reply' | 'edit', view: MessageView): void {
    composing = { mode, view };
    const original = compositionText(view);
    const label = node('[data-compose-context]');
    if (label)
      label.textContent = t('{0}: {1}', [
        mode === 'edit' ? t('Editing') : t('Replying'),
        original.slice(0, 120),
      ]);
    const bar = node('[data-compose-bar]');
    if (bar) bar.hidden = false;
    const text = node<HTMLTextAreaElement>('[data-message-text]');
    if (mode === 'edit' && text) text.value = original;
    text?.dispatchEvent(new Event('input'));
    focusRequested = true;
    focusComposer();
  }
  function clearContext(): void {
    composing = null;
    focusRequested = false;
    const label = node('[data-compose-context]');
    if (label) label.textContent = '';
    const bar = node('[data-compose-bar]');
    if (bar) bar.hidden = true;
    composerStatus();
  }
  function clearSessionPanels(): void {
    mounted?.querySelectorAll('form').forEach((form) => form.reset());
    node('[data-representative-chat]')?.replaceChildren();
    node('[data-message-pending]')?.replaceChildren();
    if (mounted) delete mounted.dataset['voicePeer'];
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
      await synchronizeVisible();
      await controller.savePins();
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
      !voice.active &&
      !attachments.selected &&
      composing?.mode !== 'edit'
    );
  }
  function queueText(): boolean {
    const field = node<HTMLTextAreaElement>('[data-message-text]');
    if (!canQueueText() || !selected || !field?.value.trim()) return false;
    try {
      textQueue.enqueue({
        id: crypto.randomUUID(),
        peer: selected.accountId,
        text: encodeDailyText({
          text: field.value,
          reply: composing?.view.id ?? null,
          forwarded: false,
        }),
      });
      field.value = '';
      clearContext();
      field.dispatchEvent(new Event('input'));
      return true;
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
            if (voice.active || attachments.selected?.voice)
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
              clearContext();
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
    if (voice.active || attachments.selected?.voice)
      traceChatSync(controller, peer.accountId, {
        event: 'navigation',
        reason: 'voice-preview',
      });
    return !voice.active && !attachments.selected?.voice && visits.open(peer);
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
      (voice.active || attachments.selected?.voice) &&
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
    await synchronizeVisible();
    await controller.savePins();
    // Opening one conversation only needs its read receipts. Account-wide
    // presence, push settings and peer states keep their periodic lifecycle.
    await historyUi.markRead(daily);
  }
  function selectPeer(peer: ConversationPeer): void {
    showDirectConversation();
    enterConversation();
    clearContext();
    if (selected?.accountId !== peer.accountId)
      resetHistoryPosition(node('[data-message-history]'));
    selected = peer;
    renderContacts();
    mountRepresentativeChat(peer);
    if (mounted) mounted.dataset['voicePeer'] = peer.accountId;
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
        loadPins: () => controller.loadPins(work),
        loadContacts: () => refreshContacts(false, work),
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
        controller.hide();
        options.directorySettled?.(session);
      }
      throw error;
    }
  }
  async function refreshChangedSelected(
    work: VaultWorkOptions = {},
  ): Promise<void> {
    if (groups.selected) return groups.refresh();
    const peer = selected;
    if (!peer || !conversationMounted('[data-direct-conversation]')) return;
    if (peer.localOnly) return refreshSelected();
    const changed = await controller.probe(work);
    if (selected !== peer || !conversationMounted('[data-direct-conversation]'))
      return;
    if (changed) {
      synchronization.prepareHistory();
      await controller.synchronize(work);
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
  ): Promise<void> {
    if (!conversationMounted('[data-direct-conversation]')) return;
    if (await controller.probe(work)) {
      await controller.loadPins(work);
      await controller.synchronize(work);
    }
  }
  async function submit(): Promise<void> {
    if (selected?.localOnly)
      throw new Error(
        'Ask your contact for permission to send new messages. Your saved history remains available.',
      );
    if (voice.active)
      throw new Error('Stop recording and check the preview before sending.');
    const text = node<HTMLTextAreaElement>('[data-message-text]');
    if (!selected || !text || (!text.value.trim() && !attachments.selected))
      throw new Error(
        'Select a contact and write a message or choose an attachment.',
      );
    await saveComposition(selected.accountId, text.value);
    text.value = '';
    text.dispatchEvent(new Event('input'));
    clearContext();
    attachments.clearSelection();
    voice.cancel();
    recordingPeer = null;
    await renderPending();
    if (navigator.onLine) {
      await sendPending();
      await synchronizeVisible();
      await controller.savePins();
    }
    if (startupWarmup.pending) await historyUi.markRead(daily);
    else await dailyTick();
  }
  /** GIF tab of the composer's emoji panel; a chosen GIF is sent at once. */
  function gifPane(host: HTMLElement, close: () => void): void {
    mountGifPane(host, gifs, (url) => {
      close();
      void run(() => sendGif(url));
    });
  }
  /** The message carries only the KLIPY link, inside the usual E2EE text. */
  async function sendGif(url: string): Promise<void> {
    if (!selected || selected.localOnly)
      throw new Error('Choose an authorized contact to send the GIF.');
    if (!gifMessageUrl(url)) throw new Error('Invalid GIF.');
    await controller.compose(
      selected.accountId,
      encodeDailyText({ text: url, reply: null, forwarded: false }),
    );
    await renderPending();
    if (navigator.onLine) {
      await sendPending();
      await synchronizeVisible();
    }
  }
  async function saveComposition(peer: string, text: string): Promise<void> {
    if (composing?.mode === 'edit') {
      if (attachments.selected)
        throw new Error(
          'Editing changes text only; remove the selected attachment.',
        );
      await controller.composeAction(
        composing.view,
        'edit',
        encodeDailyText({
          text: text,
          reply: decodeDailyText(composing.view.text).reply,
          forwarded: decodeDailyText(composing.view.text).forwarded,
        }),
      );
    } else if (attachments.selected)
      await controller.composeAttachment(
        peer,
        attachments.selected,
        encodeDailyText({
          text: text,
          reply: composing?.view.id ?? null,
          forwarded: false,
        }),
      );
    else
      await controller.compose(
        peer,
        encodeDailyText({
          text: text,
          reply: composing?.view.id ?? null,
          forwarded: false,
        }),
      );
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
    if (document.visibilityState === 'visible') await historyUi.markRead(daily);
  }
  async function searchPage(
    query: string,
    after: string | null,
  ): Promise<SearchPage> {
    if (synchronization.busy)
      throw new Error('Wait for conversations to update, then try again.');
    let result: SearchPage | null = null;
    await run(async () => {
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
      if (navigator.onLine) {
        await controller.initialize();
        await controller.synchronize();
      }
      const page = await controller.search(query, after);
      result = {
        ...page,
        next: page.next ?? (groups.entries.length ? 'groups:' : null),
      };
    });
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
    if (voice.active)
      void voice.stop(
        t(
          'Navigation interrupted recording; the excerpt is preserved for review when returning to the conversation.',
        ),
      );
    attachments.clearMedia();
    attachments.pausePreview();
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
    emojiPicker.close();
    if (reason === 'invalidate') controller.close();
    else controller.pause(reason === 'directory' ? 'conversation' : 'account');
    groups.suspend();
    rows = null;
    searchPanel.close();
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
  function beforeUnload(event: BeforeUnloadEvent): void {
    if (!voice.active && !attachments.selected?.voice && !textQueue.unsaved)
      return;
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
    if (!visible && voice.active)
      void voice.stop(
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
      await controller.synchronize();
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
    if (voice.active)
      void voice.stop(
        t(
          'The browser interrupted recording. Check the preserved excerpt when you return.',
        ),
      );
    if (!event.persisted) {
      textQueue.reset();
      outgoing.reset();
      startupWarmup.reset();
      voice.cancel();
      groups.suspend(true);
      playback.close();
      attachments.clearSelection();
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
  function bindDailyControls(): void {
    directoryUi.bind();
    bind('[data-message-emoji]', () => {
      const input = node<HTMLTextAreaElement>('[data-message-text]'),
        anchor = node('[data-message-emoji]');
      if (!input || !anchor) return;
      void emojiIntoComposer(emojiPicker, anchor, input, {
        pane: gifPane,
      }).catch(() => {
        message = t('Could not open the emoji panel.');
        status();
      });
    });
    bind('[data-compose-cancel]', () => {
      if (composing?.mode === 'edit') {
        const text = node<HTMLTextAreaElement>('[data-message-text]');
        if (text) {
          text.value = '';
          text.dispatchEvent(new Event('input'));
        }
      }
      clearContext();
    });
    bind('[data-attachment-clear]', () => {
      if (!voice.active) voice.cancel();
    });
  }
  function bindVoiceControls(): void {
    bind('[data-call-start]', () => {
      if (!selected || selected.localOnly || !options.calls) return;
      void options.calls.start(selected.accountId);
    });
    bindRecordGesture(node('[data-voice-record]'), {
      start: () => {
        if (
          synchronization.busy ||
          voice.active ||
          attachments.selected ||
          !selected ||
          !session ||
          options.calls?.active()
        )
          return;
        recordingPeer = selected.accountId;
        void voice.start();
      },
      // Releasing before the microphone opens keeps recording hands-free.
      release: () => {
        if (voice.state.phase === 'recording') void voice.stop();
      },
    });
    bind('[data-voice-stop]', () => {
      void voice.stop();
    });
    bind('[data-voice-cancel]', () => {
      voice.cancel();
      recordingPeer = null;
    });
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
    bind('[data-message-older]', () => {
      void run(async () => {
        if (!selected) return;
        controller.select(selected.accountId, true);
        if (selected.localOnly)
          await controller.openArchive(selected.accountId);
        else if (navigator.onLine)
          await controller.synchronize({ priority: 'interactive' });
        else await controller.openOffline(selected.accountId);
        await controller.savePins();
      });
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
      if (voice.active)
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
      voice.cancel();
      playback.close();
      recordingPeer = null;
      live.stop();
      emojiPicker.reset();
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
      clearContext();
      attachments.clearSelection();
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
      !synchronization.busy &&
      !textQueue.unsaved &&
      !voice.active &&
      !attachments.selected?.voice &&
      groups.canActivate(),
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
      if (selected) container.dataset['voicePeer'] = selected.accountId;
      attachments.mount(container, run);
      const form = node('[data-message-form]');
      if (form)
        bindChatComposer(form, () => {
          if (
            canQueueText() &&
            node<HTMLTextAreaElement>('[data-message-text]')?.value
          )
            textQueue.deferBackground();
          composerStatus();
        });
      bindChatOptions(container);
      mountGroups(container);
      bindVoiceControls();
      bindDailyControls();
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
