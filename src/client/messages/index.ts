import { MessageContinuity } from './continuity.ts';
import { initializeMessageDirectory } from './startup.ts';
import { MessageSynchronization } from './synchronization.ts';
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
import { ContactDirectory } from './contact-directory.ts';
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
import { attachmentContent } from '../../shared/attachments/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { Peer, AddressBookEntry } from '../../shared/contacts/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { Contacts } from '../contacts/index.ts';
import { Messages } from './controller.ts';
import type { MessageView } from './controller.ts';
import { MessageDirectory } from './directory-controller.ts';
import type { ConversationPeer } from './directory-controller.ts';
import { MessageDirectoryUi } from './directory-ui.ts';
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
    attachments = new AttachmentUi(playback, voiceStatus),
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
  let message = 'Entre e autorize este aparelho para conversar.';
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
  const controller = new Messages(access, sync, (value, update) => {
    rows = value;
    renderHistory(update);
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
    alert: () => sound.beep(),
    select: selectGroup,
  });
  const directoryData = new MessageDirectory({
    agenda,
    contacts,
    archivedPeers: (after) => controller.archivedPeers(after),
    changed: (peers) => {
      if (selected)
        selected =
          peers.find((peer) => peer.accountId === selected?.accountId) ??
          selected;
      renderContacts();
    },
  });
  const directoryUi = new MessageDirectoryUi({
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
      if (!reopenSelectedPeer(peer)) void run(() => openPeer(peer));
    },
    openContact: options.openContact,
    openGroup: (group) => {
      void run(() => groups.open(group));
    },
    changed: options.directoryChanged,
    presence: renderPresence,
  });
  function selectGroup(): void {
    if (voice.active || attachments.selected?.voice)
      throw new Error(
        'Envie ou remova a prévia de voz antes de trocar de conversa.',
      );
    selected = null;
    enterConversation();
    clearContext();
    attachments.clearSelection();
    controller.select(null);
    renderHistory();
    const direct = node('[data-direct-conversation]');
    if (direct) direct.hidden = true;
  }
  const live = new LiveMessages({
    access,
    changed: () => {
      continuity.changed();
      options.liveState?.(live.current);
      const label = node('[data-message-live]');
      if (label) label.textContent = live.notice;
      synchronization.resume();
    },
    event: (event) => {
      options.liveEvent?.(event);
      invalidateGroupAuthority(event);
      if (event === 'ready') void checkVoiceAuthority();
      if (event === 'authorization') void checkVoiceAuthority();
      hideLiveHistory(event);
      requestRefresh(
        event === 'changed' || event === 'ready' ? 'probe' : 'refresh',
      );
    },
  });
  const synchronization = new MessageSynchronization({
    state: () => ({
      generation,
      connected: connected(),
      session: !!session,
      online: navigator.onLine,
      visible: document.visibilityState === 'visible',
      suspended: continuity.suspended,
      liveConnecting: live.connecting,
    }),
    status,
    notice: (value) => {
      message = value;
    },
    complete: () => {
      message = controller.transportPending
        ? 'Alguns envios ainda estão pendentes. A retomada é automática.'
        : 'Conversas atualizadas.';
    },
    renderPending,
    pause: () => {
      controller.pauseSynchronization();
      groups.pauseSynchronization();
    },
    preloadDirect: (signal) => controller.synchronizeAll(signal),
    preloadGroups: (signal) => groups.synchronizeAll(signal),
    presence: dailyTick,
    refresh,
    changes: refreshChanges,
    periodic: periodicMessages,
    periodicWork: periodicMessageWork,
    pending: () => controller.pending(),
    sendPending: () => controller.sendPending(),
  });
  const continuity = new MessageContinuity({
    current: () => live.current,
    available: () => !!session && navigator.onLine,
    pause: suspend,
    stop: () => live.stop(),
    reconnect: () => live.retry(),
    check: () => requestRefresh('probe'),
  });
  const historyUi = new MessageHistoryUi({
    node,
    context: () => ({
      selected,
      peers: directoryData.peers,
      session,
      calls: !!options.calls,
    }),
    visible: () => conversationVisible('[data-direct-conversation]'),
    signal: () => externalAbort.signal,
    attachments,
    media: (view, thumbnail) => controller.media(view, thumbnail),
    run,
    composerChanged: composerStatus,
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
      // Cancel the history token immediately without cancelling an in-flight
      // signed mutation (the sender receives its own deletion before its reply).
      controller.hide();
      groups.suspend();
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
            'A conversa foi bloqueada. Trecho preservado somente como prévia local.',
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
        ? 'Tentar novamente'
        : 'Sincronizar agora';
    renderChatStatus();
    const directoryStatus = node('[data-directory-status]');
    if (directoryStatus)
      directoryStatus.textContent = synchronization.failed ? message : '';
  }
  function renderChatStatus(): void {
    const text = node('[data-message-status]');
    if (!text) return;
    const upToDate =
      !synchronization.busy &&
      !synchronization.failed &&
      message === 'Conversas atualizadas.';
    text.textContent = synchronization.busy
      ? 'Sincronizando…'
      : upToDate
        ? 'Atualizada'
        : message;
    // The desktop workspace hides the strip while everything is up to date.
    const strip = text.closest<HTMLElement>('.chat-feedback');
    if (strip) strip.dataset['state'] = upToDate ? 'ok' : 'notice';
  }
  function status(): void {
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
          'button:not([data-chat-back]),input,select,textarea:not([data-message-text]):not([data-group-text])',
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
      toggle.textContent = sound.enabled ? 'Desativar sons' : 'Ativar sons';
      toggle.setAttribute('aria-pressed', String(sound.enabled));
    }
    const notice = settingsHost?.querySelector('[data-sound-status]');
    if (notice)
      notice.textContent =
        sound.notice ||
        (sound.enabled
          ? 'Sons ativados neste navegador.'
          : 'Sons desativados neste navegador.');
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
  function run(work: () => Promise<void>): Promise<void> {
    return synchronization.run(work);
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
  function requestRefresh(update: LiveUpdate = 'refresh'): void {
    synchronization.request(update);
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
      label.textContent = `${mode === 'edit' ? 'Editando' : 'Respondendo'}: ${original.slice(0, 120)}`;
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
  async function transmit(): Promise<void> {
    if (navigator.onLine) {
      await controller.sendPending();
      await synchronizeVisible();
      await controller.savePins();
    }
  }
  async function forward(
    view: DailyView<MessageView>,
    peer: string,
  ): Promise<void> {
    if (!directoryData.peers.some((p) => p.accountId === peer && !p.localOnly))
      throw new Error('Selecione um contato aprovado para encaminhar.');
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
    await transmit();
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
    const current = generation;
    const pending = await controller.pending();
    if (current !== generation || list !== node('[data-message-pending]'))
      return;
    list.replaceChildren();
    for (const item of pending) {
      const li = document.createElement('li');
      li.textContent = `Envio pendente para ${item.peer.slice(0, 8)} `;
      li.append(
        action('Apagar envio', async () => {
          await controller.discard(item.id);
        }),
      );
      list.append(li);
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
      if (expected !== generation) throw new Error('Sessão alterada.');
      await work();
      if (expected !== generation) throw new Error('Sessão alterada.');
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
        label: 'Bloquear contato',
        perform: () =>
          perform(async () => {
            const expected = generation;
            if (voice.active || attachments.selected?.voice)
              throw new Error(
                'Envie ou remova a prévia de voz antes de bloquear o contato.',
              );
            await contacts.snapshot();
            if (expected !== generation) throw new Error('Sessão alterada.');
            await contacts.block(contact, true);
            if (expected !== generation) throw new Error('Sessão alterada.');
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
        label: 'Remover contato',
        perform: () =>
          perform(async () => {
            const expected = generation;
            await sync.refresh();
            if (expected !== generation) throw new Error('Sessão alterada.');
            await agenda.remove(contact);
          }),
      },
    ];
  }
  function selectedOrganizationId(target: string): string {
    if (groups.selected || !selected) return target;
    return directoryUi.contactOrganizationId(agenda.find(selected), target);
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
  async function openPeer(peer: ConversationPeer): Promise<void> {
    if (
      (voice.active || attachments.selected?.voice) &&
      selected?.accountId !== peer.accountId
    )
      throw new Error(
        'Envie ou remova a prévia de voz antes de trocar de destinatário.',
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
    await controller.loadPins();
    const card = sharedProfile();
    if (card) await controller.shareProfile(peer.accountId, card);
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
            throw new Error('Conversa alterada.');
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
    if (state?.online) return 'Online';
    return null;
  }
  function contactsMore(): void {
    const button = node('[data-message-more-contacts]');
    if (button)
      button.hidden =
        !directoryData.hasMore(navigator.onLine) && groups.next === null;
  }
  async function refreshContacts(more = false): Promise<void> {
    await directoryData.refresh(more);
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
  async function refresh(): Promise<void> {
    synchronization.startRefresh();
    const current = generation;
    try {
      await initializeMessageDirectory({
        loadPins: () => controller.loadPins(),
        loadContacts: refreshContacts,
        initialize: () => controller.initialize(),
        guard: () => {
          if (current !== generation) throw new Error('Sessão alterada.');
        },
      });
      await groups.refresh();
      contactsMore();
      await controller.sendPending();
      if (selected && conversationMounted('[data-direct-conversation]')) {
        await refreshSelected();
      }
      await controller.savePins();
      await dailyTick();
      if (
        session &&
        navigator.onLine &&
        (document.visibilityState === 'visible' || playback.open)
      )
        live.start();
    } catch (error: unknown) {
      if (current === generation) controller.hide();
      throw error;
    }
  }
  async function refreshChanges(): Promise<void> {
    await refreshChangedSelected();
    await refreshContacts();
    await groups.refresh();
    contactsMore();
    await dailyTick();
  }
  async function refreshChangedSelected(): Promise<void> {
    const peer = selected;
    if (!peer || !conversationMounted('[data-direct-conversation]')) return;
    if (peer.localOnly) return refreshSelected();
    const changed = await controller.probe();
    if (selected !== peer || !conversationMounted('[data-direct-conversation]'))
      return;
    if (changed) {
      synchronization.prepareHistory();
      await controller.synchronize();
    }
    await controller.savePins();
  }
  async function refreshSelected(): Promise<void> {
    if (!selected) return;
    if (selected.localOnly) {
      await controller.openArchive(selected.accountId);
      return;
    }
    const card = sharedProfile();
    if (card) await controller.shareProfile(selected.accountId, card);
    await synchronizeVisible();
  }
  async function synchronizeVisible(): Promise<void> {
    if (!conversationMounted('[data-direct-conversation]')) return;
    if (await controller.probe()) {
      synchronization.prepareHistory();
      await controller.synchronize();
    }
  }
  async function submit(): Promise<void> {
    if (selected?.localOnly)
      throw new Error(
        'Peça autorização ao contato para enviar novas mensagens. Seu histórico salvo continua disponível.',
      );
    if (voice.active)
      throw new Error('Pare a gravação e confira a prévia antes de enviar.');
    const text = node<HTMLTextAreaElement>('[data-message-text]');
    if (!selected || !text || (!text.value.trim() && !attachments.selected))
      throw new Error(
        'Selecione um contato e escreva a mensagem ou escolha um anexo.',
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
      await controller.sendPending();
      await synchronizeVisible();
      await controller.savePins();
    }
    await dailyTick();
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
      throw new Error('Escolha um contato autorizado para enviar o GIF.');
    if (!gifMessageUrl(url)) throw new Error('GIF inválido.');
    await controller.compose(
      selected.accountId,
      encodeDailyText({ text: url, reply: null, forwarded: false }),
    );
    await renderPending();
    if (navigator.onLine) {
      await controller.sendPending();
      await synchronizeVisible();
    }
  }
  async function saveComposition(peer: string, text: string): Promise<void> {
    if (composing?.mode === 'edit') {
      if (attachments.selected)
        throw new Error(
          'Edição altera somente texto; remova o anexo selecionado.',
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
    await pushSettings?.refresh();
    await daily.configure(preferences());
    await daily.heartbeat(document.visibilityState === 'visible');
    if (current !== generation || !connected()) return;
    const old = states,
      next = await daily.states(directoryData.peers.map((p) => p.accountId));
    if (current !== generation) return;
    await silenceArchived(next);
    if (current !== generation) return;
    states = next;
    alertUnread(old);
    renderContacts();
    if (document.visibilityState === 'visible') await historyUi.markRead(daily);
  }
  async function silenceArchived(next: Map<string, PeerState>): Promise<void> {
    for (const peer of directoryData.peers) {
      const state = next.get(peer.accountId);
      if (!state || peer.localOnly) continue;
      next.set(
        peer.accountId,
        await daily.keepArchivedSilent(
          peer.accountId,
          directoryUi.contactOrganizationId(agenda.find(peer), peer.accountId),
          state,
        ),
      );
    }
  }
  function alertUnread(old: Map<string, PeerState>): void {
    for (const [id, state] of states)
      if (
        old.has(id) &&
        state.unread > (old.get(id)?.unread ?? 0) &&
        state.mutedUntil <= Date.now()
      )
        sound.beep();
  }
  async function searchPage(
    query: string,
    after: string | null,
  ): Promise<SearchPage> {
    if (synchronization.busy)
      throw new Error('Aguarde a atualização das conversas e tente novamente.');
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
  function suspend(reason: 'pause' | 'invalidate' = 'pause'): void {
    stopPreload();
    menu.close();
    emojiPicker.close();
    if (reason === 'invalidate') controller.close();
    else controller.pause();
    groups.suspend();
    rows = null;
    searchPanel.close();
    renderHistory();
  }
  function attachmentProgress(progress: { done: number; total: number }): void {
    if (!synchronization.busy || !mounted?.isConnected) return;
    message = `Enviando anexo: parte ${progress.done} de ${progress.total}. Fechar o app pausa a transferência; o rascunho cifrado permanece.`;
    status();
  }
  function beforeUnload(event: BeforeUnloadEvent): void {
    if (!voice.active && !attachments.selected?.voice) return;
    event.preventDefault();
    event.returnValue = '';
  }
  function offline(): void {
    live.stop();
    suspend();
    message =
      'Sem conexão. O histórico salvo continua disponível neste aparelho.';
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
        'O navegador interrompeu a gravação. Confira o trecho preservado ao voltar.',
      );
    continuity.visibility(visible);
    synchronization.resume();
    void daily.heartbeat(visible).catch(() => {
      if (current !== generation) return;
      message =
        'Não foi possível atualizar a presença. Ela deixará de indicar online pelo prazo de atividade.';
      status();
    });
    if (!visible || !session || !navigator.onLine) return;
    historyUi.resume();
    if (groups.selected) requestRefresh('probe');
    void historyUi.markRead(daily).catch((error: unknown) => {
      if (current !== generation) return;
      suspend('invalidate');
      message =
        error instanceof Error
          ? error.message
          : 'Não foi possível conferir a leitura.';
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
    if (!live.current || conversationVisible('[data-group-conversation]'))
      return true;
    return (await controller.pending()).length > 0;
  }
  function preferencesChanged(): void {
    if (!synchronization.busy && session && navigator.onLine)
      void synchronization.maintainPresence();
  }
  function pageHide(event: PageTransitionEvent): void {
    continuity.freeze();
    synchronization.reset();
    if (voice.active)
      void voice.stop(
        'O navegador interrompeu a gravação. Confira o trecho preservado ao voltar.',
      );
    if (!event.persisted) {
      voice.cancel();
      groups.suspend(true);
      playback.close();
      attachments.clearSelection();
      synchronization.close();
      soundEvents.abort();
      void sound.dispose().catch(() => {
        message = 'Não foi possível encerrar o áudio deste navegador.';
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
        message = 'Não foi possível abrir o painel de emojis.';
        status();
      });
    });
    bind('[data-compose-cancel]', clearContext);
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
        void run(refreshChanges);
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
        else if (navigator.onLine) await controller.synchronize();
        else await controller.openOffline(selected.accountId);
        await controller.savePins();
      });
    });
    node<HTMLFormElement>('[data-message-form]')?.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void run(submit);
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
      if (synchronization.busy)
        throw new Error(
          'Aguarde a atualização das conversas e tente novamente.',
        );
      if (reopenSelectedPeer(peer)) return;
      await run(() => openPeer(peer));
    },
    async contactSaved(contact: AddressBookEntry): Promise<void> {
      await agenda.saved(contact);
      renderContacts();
    },
    prepareCall(): void {
      if (voice.active)
        throw new Error(
          'Pare ou cancele a gravação de voz antes de iniciar ou atender uma chamada. A prévia continuará disponível.',
        );
    },
    callLabel: (peer: string) =>
      directoryData.peers.find((p) => p.accountId === peer)?.name ||
      directoryData.peers.find((p) => p.accountId === peer)?.address ||
      `Contato aprovado ${peer.slice(0, 8)}`,
    openSearch: () => searchPanel.open(),
    applyPrivacy: (preferences: DailyPreferences) =>
      daily.configure(preferences),
    setSession(value: AccountSession | null): void {
      if (sameSession(value)) {
        session = value;
        daily.setSession(value);
        groups.setSession(value);
        return;
      }
      generation++;
      continuity.reset();
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
        ? 'Abra os contatos e sincronize para conversar.'
        : 'Entre e autorize este aparelho para conversar.';
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
    canActivate: () =>
      !synchronization.busy &&
      !voice.active &&
      !attachments.selected?.voice &&
      groups.canActivate(),
    leave(): void {
      externalAbort.abort();
      historyUi.clearMedia();
      externalAbort = new AbortController();
      suspend();
      groups.leave();
      if (voice.active)
        void voice.stop(
          'Navegação interrompeu a gravação; trecho preservado para conferir ao voltar à conversa.',
        );
      attachments.clearMedia();
      attachments.pausePreview();
    },
    viewChanged(): void {
      if (!conversationVisible()) this.leave();
    },
    mountSettings(container: HTMLElement): void {
      settingsHost = container;
      container.innerHTML = notificationSettings;
      const on = (selector: string, work: () => Promise<void>) =>
        container.querySelector(selector)?.addEventListener('click', () => {
          void run(work);
        });
      const peerLabel = container.querySelector('[data-mute-peer]');
      if (peerLabel)
        peerLabel.textContent =
          selected?.name ||
          selected?.address ||
          groups.selected?.title ||
          'selecione uma conversa primeiro';
      on('[data-mute]', async () => {
        const target = groups.selected?.state.groupId ?? selected?.accountId;
        if (!target || selected?.localOnly)
          throw new Error(
            'Selecione uma conversa antes de alterar os alertas.',
          );
        await daily.mute(
          target,
          Number(
            container.querySelector<HTMLSelectElement>('[data-mute-duration]')
              ?.value ?? 0,
          ),
          { settingsId: selectedOrganizationId(target) },
        );
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
            'Som alterado na interface, mas a preferência para push não foi salva. Não é possível garantir silêncio das notificações do sistema.',
          );
        }
      });
      status();
    },
    mount(container: HTMLElement, directoryHost: HTMLElement): void {
      mounted = container;
      directory = directoryHost;
      container.innerHTML = directChat();
      if (selected) container.dataset['voicePeer'] = selected.accountId;
      attachments.mount(container, run);
      const form = node('[data-message-form]');
      if (form) bindChatComposer(form, composerStatus);
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
