import {
  directChat,
  bindChatComposer,
  bindChatOptions,
  updateChatComposer,
  historyPosition,
  resetHistoryPosition,
  updateMessageStates,
} from '../chat-ui/index.ts';
import { displayName, paintAvatar, shortAddress } from '../appearance/index.ts';
import type { HistoryUpdate } from '../message-visibility/index.ts';
import { mountPushSettings } from '../push-settings/index.ts';
import { notificationSettings } from './settings.ts';
import { ConversationSearch } from './search.ts';
import type { SearchPage } from './search.ts';
import { renderDirectory, filteredConversations } from './directory.ts';
import type {
  ConversationEntry,
  ConversationAction,
  ConversationFilter,
} from './directory.ts';
import { ConversationMenu } from './directory-menu.ts';
import { ContactDirectory, agendaContact } from './contact-directory.ts';
import type { SavedContact } from './contact-directory.ts';
import { organizationActions } from './directory-actions.ts';
import { startGroups } from '../groups/index.ts';
import type { startRepresentatives } from '../representatives/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import { VoiceRecording } from '../voice-recording/index.ts';
import { voiceDuration, voiceRate } from '../../shared/voice/index.ts';
import { AttachmentUi } from '../attachment-ui/index.ts';
import type { LiveEvent } from '../message-live/index.ts';
import { LiveMessages, LiveUpdates } from '../message-live/index.ts';
import type { LiveUpdate } from '../message-live/index.ts';
import { Daily } from '../daily/index.ts';
import type { PeerState } from '../daily/index.ts';
import { dailyViews } from '../daily-text/index.ts';
import type { DailyView } from '../daily-text/index.ts';
import { messageActions } from '../message-actions/index.ts';
import { observeMessageControls } from '../message-controls/index.ts';
import { messageChecks } from '../message-status/index.ts';
import { EmojiPicker, emojiIntoComposer, emojiText } from '../emoji/index.ts';
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
import { profileCard } from '../message-profile/index.ts';
import { Messages, receivedState } from './controller.ts';
import type { MessageView } from './controller.ts';
type ConversationPeer = Peer & { localOnly?: boolean };
export function startMessages(
  access: VaultAccess,
  sync: VaultSync,
  options: {
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
  let peers: ConversationPeer[] = [],
    states = new Map<string, PeerState>(),
    directoryFilter: ConversationFilter = 'all';
  let composing: { mode: 'reply' | 'edit'; view: MessageView } | null = null;
  let focusRequested = false;
  let navigatingToConversation = false;
  let readIds = new Set<string>();
  let directory: HTMLElement | null = null;
  const searchPanel = new ConversationSearch(searchPage);
  let mounted: HTMLElement | null = null,
    busy = false,
    selected: ConversationPeer | null = null,
    session: AccountSession | null = null,
    rows: readonly MessageView[] | null = null,
    generation = 0,
    automaticAttempts = 0,
    lastTransferAttempt = 0;
  let archivedAfter: string | null = null;
  let remoteMore = true,
    archivedMore = true;
  let failed = false;
  let maintenance: Promise<void> | null = null;
  let preloadTimer: ReturnType<typeof setTimeout> | null = null;
  let preloadAbort: AbortController | null = null;
  let preloadRunning = false;
  let preloadGroups = false;
  let preloadRetryAt = 0;
  let preloadDirectPending = true;
  let preloadGroupsPending = true;
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
    const notice = node('[data-voice-status]');
    if (notice)
      notice.textContent =
        voice.state.notice +
        (voice.active && voice.state.samples
          ? ` ${voiceDuration({ samples: voice.state.samples, sampleRate: voiceRate })} / 1:30`
          : '');
    composerStatus();
    voiceButtons();
    voiceFiles();
  }
  function composerStatus(): void {
    updateChatComposer(node('[data-message-form]'), {
      blocked: busy || rows === null || !selected,
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
        busy ||
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
        busy || rows === null || voice.active || !!attachments.selected?.voice;
  }
  const controller = new Messages(access, sync, (value, update) => {
    rows = value;
    renderHistory(update);
  });
  const updates = new LiveUpdates({
    available: () =>
      !busy &&
      maintenance === null &&
      connected() &&
      !!session &&
      navigator.onLine &&
      document.visibilityState === 'visible',
    run: (update) => {
      void run(update === 'refresh' ? refresh : refreshChanges);
    },
  });
  const groups = startGroups(access, sync, {
    playback,
    daily,
    run,
    changed: () => renderContacts(peers),
    peers: () => peers.filter((p) => !p.localOnly),
    organizationPeers: () => organizationIds(),
    isBusy: () => busy,
    alert: () => sound.beep(),
    select: selectGroup,
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
      options.liveState?.(live.connected);
      const label = node('[data-message-live]');
      if (label) label.textContent = live.notice;
    },
    event: (event) => {
      options.liveEvent?.(event);
      invalidateGroupAuthority(event);
      if (event === 'ready') void checkVoiceAuthority();
      if (event === 'authorization') void checkVoiceAuthority();
      hideLiveHistory(event);
      requestRefresh(event === 'changed' ? 'probe' : 'refresh');
    },
  });
  function invalidateGroupAuthority(event: LiveEvent): void {
    if (['invalidated', 'revoked', 'ended'].includes(event))
      groups.suspend(event === 'revoked' || event === 'ended');
  }
  function hideLiveHistory(event: LiveEvent): void {
    stopPreload();
    if (event === 'revoked' || event === 'ended') {
      voice.cancel();
      attachments.clearSelection();
      playback.close();
    }
    if (['authorization', 'invalidated', 'revoked', 'ended'].includes(event))
      suspend();
    else if (event === 'removed') {
      // Cancel the history token immediately without cancelling an in-flight
      // signed mutation (the sender receives its own deletion before its reply).
      controller.hide();
      groups.suspend();
      menu.close();
      searchPanel.close();
    } else if (event === 'changed') controller.hint();
    else controller.hide();
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
      retry.textContent = failed ? 'Tentar novamente' : 'Sincronizar agora';
    renderChatStatus();
    const directoryStatus = node('[data-directory-status]');
    if (directoryStatus) directoryStatus.textContent = failed ? message : '';
  }
  function renderChatStatus(): void {
    const text = node('[data-message-status]');
    if (!text) return;
    const upToDate = !busy && !failed && message === 'Conversas atualizadas.';
    text.textContent = busy
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
    menu.setBusy(busy);
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
          control.disabled = busy;
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
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    stopPreload();
    busy = true;
    failed = false;
    const current = generation;
    status();
    try {
      // A click during presence maintenance is accepted and serialized, not dropped.
      await maintenance;
      if (current !== generation) return;
      await work();
      if (current !== generation) return;
      if (navigator.onLine)
        message = controller.transportPending
          ? 'Alguns envios ainda estão pendentes. A retomada é automática.'
          : 'Conversas atualizadas.';
    } catch (error: unknown) {
      if (current === generation) {
        failed = true;
        message =
          error instanceof Error
            ? error.message
            : 'Não foi possível concluir a operação.';
      }
    } finally {
      busy = false;
      if (current === generation) {
        await renderPending().catch(() => {
          message =
            'Não foi possível abrir os envios pendentes deste aparelho.';
        });
        status();
      }
      updates.resume();
      schedulePreload();
    }
  }
  function stopPreload(): void {
    if (preloadTimer !== null) clearTimeout(preloadTimer);
    preloadTimer = null;
    preloadAbort?.abort();
    controller.pauseSynchronization();
    groups.pauseSynchronization();
  }
  function schedulePreload(delay = 1000): void {
    if (preloadRunning || preloadTimer !== null || !canPreload()) return;
    preloadDirectPending = true;
    preloadGroupsPending = true;
    preloadTimer = setTimeout(
      () => {
        preloadTimer = null;
        void preloadHistory();
      },
      Math.max(delay, preloadRetryAt - Date.now()),
    );
  }
  function canPreload(): boolean {
    return (
      !busy &&
      maintenance === null &&
      connected() &&
      !!session &&
      navigator.onLine &&
      document.visibilityState === 'visible'
    );
  }
  async function preloadHistory(): Promise<void> {
    if (!canPreload() || preloadRunning) return;
    preloadRunning = true;
    const abort = new AbortController(),
      current = generation;
    preloadAbort = abort;
    try {
      if (preloadGroups && preloadGroupsPending)
        preloadGroupsPending = await groups.synchronizeAll(abort.signal);
      else preloadDirectPending = await controller.synchronizeAll(abort.signal);
      preloadGroups =
        preloadGroupsPending && (!preloadGroups || !preloadDirectPending);
    } catch (error: unknown) {
      preloadFailure(error, abort, current);
    } finally {
      preloadRunning = false;
      if (preloadAbort === abort) preloadAbort = null;
      continuePreload(current);
    }
  }
  function preloadFailure(
    error: unknown,
    abort: AbortController,
    current: number,
  ): void {
    if (abort.signal.aborted || current !== generation) return;
    message =
      error instanceof Error
        ? error.message
        : 'Não foi possível preparar o histórico das conversas.';
    status();
    preloadRetryAt = Date.now() + 61000;
  }
  function continuePreload(current: number): void {
    if (
      current !== generation ||
      !canPreload() ||
      !(preloadDirectPending || preloadGroupsPending)
    )
      return;
    // Keep each completed branch complete until a foreground/live update.
    preloadTimer = setTimeout(
      () => {
        preloadTimer = null;
        void preloadHistory();
      },
      Math.max(1000, preloadRetryAt - Date.now()),
    );
  }
  async function maintainPresence(): Promise<void> {
    if (busy || maintenance) return;
    const current = generation;
    stopPreload();
    maintenance = dailyTick()
      .catch((error: unknown) => {
        if (current !== generation) return;
        message =
          error instanceof Error
            ? error.message
            : 'Não foi possível atualizar a presença.';
        if (!busy) status();
      })
      .finally(() => {
        maintenance = null;
        updates.resume();
        schedulePreload();
      });
    await maintenance;
  }
  function conversationVisible(selector = '.chat-panel'): boolean {
    return (
      document.visibilityState === 'visible' &&
      !!mounted?.isConnected &&
      !!node(selector)?.getClientRects().length
    );
  }
  function enterConversation(): void {
    navigatingToConversation = true;
    try {
      options.openConversation();
    } finally {
      navigatingToConversation = false;
    }
  }
  async function resumePending(): Promise<void> {
    if (automaticAttempts >= 3 || Date.now() - lastTransferAttempt < 60000)
      return;
    lastTransferAttempt = Date.now();
    if (!(await controller.pending()).length) return;
    automaticAttempts++;
    await controller.sendPending();
  }
  function requestRefresh(update: LiveUpdate = 'refresh'): void {
    automaticAttempts = 0;
    updates.request(update);
  }
  function peerLabel(): string {
    return (
      selected?.name || selected?.address || 'Selecione um contato aprovado'
    );
  }
  const urls: string[] = [];
  function renderHistory(update: HistoryUpdate = 'history'): void {
    const history = node('[data-message-history]');
    if (!history) return;
    const restoreScroll = historyPosition(history);
    renderHistoryContent(history, update);
    history.hidden = rows === null;
    const gate = node('[data-message-gate]');
    if (gate) {
      gate.hidden = rows !== null;
      gate.textContent =
        'Sincronizando mensagens… O histórico abre após conferir as atualizações e exclusões.';
    }
    const older = node('[data-message-older]');
    if (older) older.hidden = rows === null || rows.length === 0;
    renderPeer();
    restoreScroll();
    composerStatus();
  }
  function renderHistoryContent(
    history: HTMLElement,
    update: HistoryUpdate,
  ): void {
    if (update === 'history') {
      attachments.clearMedia();
      for (const url of urls.splice(0)) URL.revokeObjectURL(url);
      history.replaceChildren();
      for (const view of dailyViews(rows ?? []))
        history.append(renderMessage(view));
    } else if (rows !== null) renderMessageStates();
  }
  function renderMessageStates(): void {
    updateMessageStates(
      node('[data-message-history]'),
      new Map(
        dailyViews(rows ?? []).map((view) => [view.id, messageState(view)]),
      ),
    );
  }
  function renderPeerIdentity(): void {
    const title = node('[data-message-peer]');
    if (title) {
      title.textContent = selected ? displayName(peerLabel()) : peerLabel();
      title.title = selected?.address ?? '';
    }
    const avatar = node('[data-chat-avatar]');
    if (avatar)
      paintAvatar(avatar, {
        label: peerLabel(),
        seed: selected?.address ?? '',
      });
  }
  function renderPeer(): void {
    renderPeerIdentity();
    const call = node('[data-call-start]');
    if (call) call.hidden = !options.calls || !!selected?.localOnly;
    const form = node('[data-message-form]');
    if (form) form.hidden = selected?.localOnly === true;
  }
  function messageState(view: DailyView<MessageView>): HTMLElement {
    const detail = document.createElement('small');
    detail.className = 'message-meta';
    const checks = messageChecks({ ...view, read: readIds.has(view.id) });
    if (checks) {
      const icon = document.createElement('span');
      icon.className = `message-checks ${checks.color}`;
      icon.textContent = checks.text;
      icon.setAttribute('role', 'img');
      icon.setAttribute('aria-label', checks.label);
      icon.title = `${checks.label}. ${view.state}`;
      detail.append(icon);
    } else if (view.state === receivedState) detail.title = view.state;
    else detail.textContent = view.state;
    if (view.edited)
      detail.prepend(detail.childNodes.length ? 'Editada · ' : 'Editada');
    return detail;
  }
  function renderAnnotations(
    view: DailyView<MessageView>,
    article: HTMLElement,
  ): void {
    if (view.content.reply) {
      const reply = document.createElement('small');
      const original = dailyViews(rows ?? []).find(
        (row) => row.id === view.content.reply,
      );
      reply.textContent = original
        ? `Em resposta: ${original.content.text.slice(0, 120)}`
        : 'Resposta: mensagem original fora desta página ou indisponível.';
      article.append(reply);
    }
    if (view.content.forwarded) {
      const forwarded = document.createElement('small');
      forwarded.textContent = 'Encaminhada';
      article.append(forwarded);
    }
    if (view.reactions.length) {
      const reactions = document.createElement('p');
      emojiText(reactions, view.reactions.join(' '));
      article.append(reactions);
    }
  }
  function renderMessage(view: DailyView<MessageView>): HTMLElement {
    const article = document.createElement('article');
    article.className = view.own ? 'chat-message own' : 'chat-message';
    article.dataset['message'] = view.id;
    article.setAttribute(
      'aria-label',
      view.own
        ? 'Mensagem enviada por você'
        : `Mensagem recebida de ${peerLabel()}`,
    );
    const text = document.createElement('p');
    renderContent(article, text, view);
    const detail = messageState(view);
    renderAnnotations(view, article);
    article.append(text, detail);
    article.append(
      messageActions({
        view,
        peers: peers.filter((p) => !p.localOnly),
        replyAllowed: !selected?.localOnly,
        action,
        picker: emojiPicker,
        choose,
        react: async (v, reaction) => {
          await controller.composeAction(
            v,
            'reaction',
            encodeDailyText({
              text: reaction,
              reply: null,
              forwarded: false,
            }),
          );
          await transmit();
        },
        forward,
        ...(!view.archived && view.own
          ? {
              remove: async () => {
                await controller.remove(view);
                await synchronizeVisible();
              },
            }
          : {}),
      }),
    );
    return article;
  }
  function renderContent(
    article: HTMLElement,
    text: HTMLElement,
    view: DailyView<MessageView>,
  ): void {
    if (view.kind === 'attachment') {
      attachments.render({
        article,
        view,
        load: (v, thumb) => controller.media(v, thumb),
        run,
      });
    } else if (view.kind === 'profile') {
      const card = profileCard(JSON.parse(view.text) as unknown);
      text.textContent = card.name
        ? `Perfil de ${card.name}`
        : 'Perfil compartilhado';
      if (card.photo) {
        const img = document.createElement('img'),
          url = URL.createObjectURL(
            new Blob([card.photo.bytes], { type: card.photo.type }),
          );
        urls.push(url);
        img.src = url;
        img.alt = 'Foto compartilhada pelo contato';
        img.width = 96;
        img.height = 96;
        article.append(img);
      }
    } else if (
      !options.representatives?.renderCard(
        article,
        view.content.text,
        view.own
          ? session
          : (peers.find((p) => p.accountId === view.peer) ?? null),
      )
    )
      emojiText(text, view.content.text);
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
    if (!peers.some((p) => p.accountId === peer && !p.localOnly))
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
      ...peers.map((p) => p.accountId),
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
      renderContacts(peers);
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
  function peerEntry(peer: ConversationPeer): ConversationEntry {
    const saved = agenda.find(peer),
      contact = saved?.contact ?? agendaContact(peer),
      favoriteId = agenda.id(peer);
    const settingsId = contactOrganizationId(saved, peer.accountId);
    const settings = daily.conversation(settingsId);
    return {
      id: peer.accountId,
      title: contactTitle(contact, peer),
      detail: contactLabel(peer, settingsId),
      kind: 'contact',
      seed: peer.address,
      status: statusAuthors.has(peer.accountId),
      searchText: `${contact.alias} ${peer.name} ${peer.address}`,
      selected: selected?.accountId === peer.accountId,
      hidden: contact.removed,
      ...settings,
      favorite: daily.favorite(favoriteId),
      unread: states.get(peer.accountId)?.unread ?? 0,
      actions: contactActions(
        contact,
        settingsId,
        peer.localOnly ? null : peer.accountId,
      ),
      menuNote:
        'Remover contato preserva histórico e permissões. Arquivar silencia; desarquivar não retoma alertas automaticamente.',
      open: () => {
        void run(() => openPeer(peer));
      },
    };
  }
  function contactOrganizationId(
    saved: SavedContact | undefined,
    peer: string,
  ): string {
    return saved && daily.hasOrganization(saved.entity) ? saved.entity : peer;
  }
  function selectedOrganizationId(target: string): string {
    if (groups.selected || !selected) return target;
    return contactOrganizationId(agenda.find(selected), target);
  }
  function contactTitle(contact: AddressBookEntry, peer: Peer): string {
    return contact.alias || peer.name || peer.address;
  }
  function savedEntry(saved: SavedContact): ConversationEntry {
    const { contact, entity } = saved,
      settings = daily.conversation(entity);
    return {
      id: entity,
      title: contact.alias || contact.address,
      detail: `${settings.pinned ? '📌 ' : ''}${shortAddress(contact.address)} · salvo na agenda`,
      kind: 'contact',
      seed: contact.address,
      searchText: `${contact.alias} ${contact.address}`,
      selected: false,
      hidden: contact.removed,
      ...settings,
      favorite: daily.favorite(entity),
      unread: 0,
      actions: contactActions(contact, entity, null),
      menuNote:
        'Salvar ou remover da agenda não altera o consentimento nem apaga o histórico.',
      open: () => options.openContact(contact),
    };
  }
  function groupEntries(): ConversationEntry[] {
    return groups.entries.map((group) => {
      const id = group.state.groupId,
        settings = daily.conversation(id);
      return {
        id,
        title: group.title,
        detail: groups.listLabel(group).replace(group.title + ' · ', ''),
        kind: 'group',
        searchText: group.title,
        selected: groups.selected?.state.groupId === id,
        ...settings,
        favorite: daily.favorite(id),
        unread: groups.unread(id),
        actions: organizationActions({
          daily,
          settingsId: id,
          favoriteId: id,
          mutePeer: group.localOnly ? null : id,
          perform: performDirectoryAction,
        }),
        menuNote:
          'Arquivar silencia alertas. Desarquivar não retoma alertas automaticamente.',
        open: () => {
          void run(() => groups.open(group));
        },
      };
    });
  }
  function renderContacts(peers: ConversationPeer[]): void {
    const list = node('[data-message-contacts]');
    if (!list) return;
    const panel = node('.chat-panel');
    if (panel) panel.dataset['empty'] = String(!selected && !groups.selected);
    const entries: ConversationEntry[] = [
      ...peers.map(peerEntry),
      ...agenda.entries
        .filter(
          (saved) =>
            !peers.some(
              (peer) =>
                peer.ecosystem === saved.contact.ecosystem &&
                peer.address === saved.contact.address,
            ),
        )
        .map(savedEntry),
      ...groupEntries(),
    ];
    const sorted = filteredConversations(entries, directoryFilter);
    renderDirectory(list, sorted, {
      menu,
      empty:
        directoryFilter === 'all'
          ? 'Adicione um contato ou entre em um grupo para começar.'
          : 'Nenhuma conversa neste filtro.',
    });
    directory
      ?.querySelectorAll<HTMLButtonElement>('[data-conversation-filter]')
      .forEach((button) =>
        button.setAttribute(
          'aria-pressed',
          String(button.dataset['conversationFilter'] === directoryFilter),
        ),
      );
    const tools = node('[data-group-tools]');
    if (tools) tools.hidden = directoryFilter !== 'groups';
    options.directoryChanged(entries.length > 0);
    searchPanel.update(entries);
    renderPresence();
  }
  function contactLabel(peer: Peer, settingsId: string): string {
    const state = states.get(peer.accountId),
      settings = daily.conversation(settingsId);
    const conflict = daily.organizationConflict(settingsId)
      ? ' · organização em conflito'
      : '';
    const address = shortAddress(peer.address);
    return `${settings.pinned ? '📌 ' : ''}${address}${state && state.mutedUntil > Date.now() ? ' · silenciada' : ''}${conflict}`;
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
    await dailyTick();
  }
  function selectPeer(peer: ConversationPeer): void {
    showDirectConversation();
    enterConversation();
    clearContext();
    if (selected?.accountId !== peer.accountId)
      resetHistoryPosition(node('[data-message-history]'));
    selected = peer;
    renderContacts(peers);
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
    if (state?.lastSeen)
      return `Último acesso: ${new Date(state.lastSeen).toLocaleString('pt-BR')}`;
    return null;
  }
  function contactsMore(): void {
    const button = node('[data-message-more-contacts]');
    if (button)
      button.hidden =
        !agenda.more &&
        !archivedMore &&
        (!navigator.onLine || !remoteMore) &&
        groups.next === null;
  }
  async function refreshLocalContacts(more = false): Promise<void> {
    await agenda.load(more);
    if (!more) {
      archivedAfter = null;
      archivedMore = true;
    }
    const local = archivedMore
      ? await controller.archivedPeers(archivedAfter)
      : { items: [], next: null };
    archivedAfter = local.next;
    archivedMore = local.next !== null;
    const combined = new Map(peers.map((p) => [p.accountId, p]));
    for (const peer of local.items)
      if (!combined.has(peer.accountId))
        combined.set(peer.accountId, { ...peer, localOnly: true });
    peers = [...combined.values()];
    await agenda.prepare(peers);
    if (session) await groups.refresh(more);
    else await daily.loadSettings(organizationIds());
    renderContacts(peers);
    contactsMore();
    if (selected && conversationVisible('[data-direct-conversation]'))
      await controller.openOffline(selected.accountId);
  }
  function updateSelected(combined: Map<string, ConversationPeer>): void {
    if (selected && combined.has(selected.accountId))
      selected = combined.get(selected.accountId)!;
  }
  async function refreshContacts(more = false): Promise<void> {
    await agenda.load(more);
    if (!more) {
      remoteMore = true;
      archivedMore = true;
      archivedAfter = null;
    }
    const page = remoteMore
      ? await contacts.list('approved', more)
      : { items: [], next: null };
    remoteMore = page.next !== null;
    const local = archivedMore
      ? await controller.archivedPeers(archivedAfter)
      : { items: [], next: null };
    archivedAfter = local.next;
    archivedMore = local.next !== null;
    const combined = new Map<string, ConversationPeer>(
      more ? peers.map((p) => [p.accountId, p]) : [],
    );
    for (const item of local.items)
      if (!combined.has(item.accountId))
        combined.set(item.accountId, { ...item, localOnly: true });
    for (const item of page.items) combined.set(item.accountId, item);
    peers = [...combined.values()];
    await agenda.prepare(peers);
    updateSelected(combined);
    renderContacts(peers);
    contactsMore();
  }
  async function refresh(): Promise<void> {
    updates.clear();
    lastTransferAttempt = Date.now();
    controller.hide();
    await controller.initialize();
    await controller.loadPins();
    await refreshContacts();
    await groups.refresh();
    contactsMore();
    await controller.sendPending();
    if (selected && conversationVisible('[data-direct-conversation]')) {
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
    if (!peer || !conversationVisible('[data-direct-conversation]')) return;
    if (peer.localOnly) return refreshSelected();
    const changed = await controller.probe();
    if (selected !== peer || !conversationVisible('[data-direct-conversation]'))
      return;
    if (changed) await controller.synchronize();
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
    if (conversationVisible('[data-direct-conversation]'))
      await controller.synchronize();
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
      next = await daily.states(peers.map((p) => p.accountId));
    if (current !== generation) return;
    await silenceArchived(next);
    if (current !== generation) return;
    states = next;
    alertUnread(old);
    renderContacts(peers);
    await markVisibleRead();
  }
  async function silenceArchived(next: Map<string, PeerState>): Promise<void> {
    for (const peer of peers) {
      const state = next.get(peer.accountId);
      if (!state || peer.localOnly) continue;
      next.set(
        peer.accountId,
        await daily.keepArchivedSilent(
          peer.accountId,
          contactOrganizationId(agenda.find(peer), peer.accountId),
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
  function readableWindow(): {
    peer: string;
    views: readonly MessageView[];
  } | null {
    if (
      !selected ||
      selected.localOnly ||
      rows === null ||
      !conversationVisible('[data-direct-conversation]') ||
      !node('[data-message-history]')?.getClientRects().length
    )
      return null;
    return { peer: selected.accountId, views: rows };
  }
  function readStillVisible(
    peer: string,
    views: readonly MessageView[],
  ): boolean {
    return (
      rows === views &&
      selected?.accountId === peer &&
      conversationVisible('[data-direct-conversation]')
    );
  }
  async function markVisibleRead(): Promise<void> {
    const window = readableWindow();
    if (!window) return;
    const { views: currentRows, peer } = window;
    const incoming = currentRows
      .filter(
        (r) =>
          !r.own &&
          !r.archived &&
          !r.relation &&
          r.kind !== 'profile' &&
          r.state !== 'Suspensa',
      )
      .map((r) => r.id);
    if (incoming.length) await daily.read(peer, incoming);
    if (!readStillVisible(peer, currentRows)) return;
    const receipts = await daily.receipts(
      currentRows
        .filter(
          (r) => r.own && !r.archived && !r.relation && r.kind !== 'profile',
        )
        .map((r) => r.id),
    );
    if (!readStillVisible(peer, currentRows)) return;
    readIds = receipts;
    renderMessageStates();
  }
  async function searchPage(
    query: string,
    after: string | null,
  ): Promise<SearchPage> {
    if (busy)
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
  function suspend(): void {
    stopPreload();
    menu.close();
    emojiPicker.close();
    controller.close();
    groups.suspend();
    rows = null;
    searchPanel.close();
    renderHistory();
  }
  window.addEventListener('0xdmme-attachment-progress', (event) => {
    const progress = (event as CustomEvent<{ done: number; total: number }>)
      .detail;
    if (!busy || !mounted?.isConnected) return;
    message = `Enviando anexo: parte ${progress.done} de ${progress.total}. Fechar o app pausa a transferência; o rascunho cifrado permanece.`;
    status();
  });
  window.addEventListener('beforeunload', (event) => {
    if (!voice.active && !attachments.selected?.voice) return;
    event.preventDefault();
    event.returnValue = '';
  });
  window.addEventListener('offline', () => {
    live.stop();
    suspend();
    message =
      'Sem conexão. O histórico salvo continua disponível neste aparelho.';
    void run(refreshLocalContacts);
    status();
  });
  window.addEventListener('online', () => {
    if (session && (document.visibilityState === 'visible' || playback.open))
      live.start();
    suspend();
    requestRefresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (!playback.open) live.stop();
      if (voice.active)
        void voice.stop(
          'O navegador interrompeu a gravação. Confira o trecho preservado ao voltar.',
        );
    } else if (session) live.start();
    suspend();
    void daily.heartbeat(document.visibilityState === 'visible').catch(() => {
      message =
        'Não foi possível atualizar a presença. Ela deixará de indicar online pelo prazo de atividade.';
      status();
    });
    if (
      document.visibilityState === 'visible' &&
      mounted?.isConnected &&
      session &&
      navigator.onLine
    )
      requestRefresh();
  });
  const stopControls = observeMessageControls(() => {
    suspend();
    requestRefresh();
  });
  const devicesChannel =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel('0xdmme-device-changes');
  devicesChannel?.addEventListener('message', () => {
    suspend();
    void checkVoiceAuthority();
  });

  window.addEventListener('0xdmme-history-imported', () => {
    groups.historyChanged();
    if (mounted?.isConnected && !busy)
      void run(navigator.onLine ? refresh : refreshLocalContacts);
  });
  async function groupTick(): Promise<void> {
    if (!mounted?.isConnected) return;
    if (!live.connected) await groups.refresh();
    if (conversationVisible('[data-group-conversation]'))
      await groups.resumePending();
  }
  function canMaintain(): boolean {
    return (
      !busy &&
      maintenance === null &&
      !!session &&
      navigator.onLine &&
      document.visibilityState === 'visible'
    );
  }
  async function periodicMessages(): Promise<void> {
    await groupTick();
    if (
      !conversationVisible('[data-direct-conversation]') ||
      !selected ||
      selected.localOnly
    )
      return;
    await resumePending();
    if (!live.connected && (await controller.probe())) {
      if (!conversationVisible('[data-direct-conversation]')) return;
      await controller.synchronize();
      await controller.savePins();
    }
  }
  async function periodicTick(): Promise<void> {
    if (!canMaintain()) return;
    const current = generation;
    try {
      await maintainPresence();
      if (current !== generation || !canMaintain()) return;
      if (!(await periodicMessageWork())) return;
      if (current !== generation) return;
      await run(periodicMessages);
    } catch (error: unknown) {
      if (current !== generation) return;
      message =
        error instanceof Error
          ? error.message
          : 'Não foi possível conferir os envios pendentes.';
      status();
    }
  }
  async function periodicMessageWork(): Promise<boolean> {
    if (!live.connected || conversationVisible('[data-group-conversation]'))
      return true;
    return (await controller.pending()).length > 0;
  }
  const timer = setInterval(() => {
    void periodicTick();
  }, 30000);
  window.addEventListener('0xdmme-profile-preferences', () => {
    if (!busy && session && navigator.onLine) void maintainPresence();
  });
  window.addEventListener('pagehide', (event) => {
    updates.clear();
    live.stop();
    if (voice.active)
      void voice.stop(
        'O navegador interrompeu a gravação. Confira o trecho preservado ao voltar.',
      );
    if (!event.persisted) {
      voice.cancel();
      groups.suspend(true);
      playback.close();
      attachments.clearSelection();
      clearInterval(timer);
      stopControls();
      devicesChannel?.close();
      soundEvents.abort();
      void sound.dispose().catch(() => {
        message = 'Não foi possível encerrar o áudio deste navegador.';
        status();
      });
    }
    suspend();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      if (session && navigator.onLine) live.start();
      suspend();
      if (mounted?.isConnected && session && navigator.onLine)
        void run(refresh);
    }
  });
  function bind(selector: string, handler: () => void): void {
    node(selector)?.addEventListener('click', handler);
  }
  function bindDailyControls(): void {
    const filters: readonly ConversationFilter[] = [
      'all',
      'unread',
      'favorites',
      'groups',
      'archived',
    ];
    for (const filter of filters)
      bind(`[data-conversation-filter="${filter}"]`, () => {
        directoryFilter = filter;
        renderContacts(peers);
      });
    bind('[data-message-emoji]', () => {
      const input = node<HTMLTextAreaElement>('[data-message-text]'),
        anchor = node('[data-message-emoji]');
      if (!input || !anchor) return;
      void emojiIntoComposer(emojiPicker, anchor, input).catch(() => {
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
    bind('[data-voice-record]', () => {
      if (
        busy ||
        voice.active ||
        attachments.selected ||
        !selected ||
        !session ||
        options.calls?.active()
      )
        return;
      recordingPeer = selected.accountId;
      void voice.start();
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
    renderContacts(peers);
    contactsMore();
  }
  function bindMessageControls(): void {
    bind('[data-message-refresh]', () => {
      if (live.connected) {
        void run(refreshChanges);
        return;
      }
      if (session && navigator.onLine) live.retry();
      void run(refresh);
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
    groupInvites: () => groups.invites(),
    respondGroupInvite: (id: string, accept: boolean) =>
      groups.respondInvite(id, accept),
    statusesChanged(authors: ReadonlySet<string>): void {
      statusAuthors = authors;
      renderContacts(peers);
    },
    async openContact(peer: Peer): Promise<void> {
      if (busy)
        throw new Error(
          'Aguarde a atualização das conversas e tente novamente.',
        );
      await run(() => openPeer(peer));
    },
    async contactSaved(contact: AddressBookEntry): Promise<void> {
      await agenda.saved(contact);
      renderContacts(peers);
    },
    prepareCall(): void {
      if (voice.active)
        throw new Error(
          'Pare ou cancele a gravação de voz antes de iniciar ou atender uma chamada. A prévia continuará disponível.',
        );
    },
    callLabel: (peer: string) =>
      peers.find((p) => p.accountId === peer)?.name ||
      peers.find((p) => p.accountId === peer)?.address ||
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
      agenda.clear();
      menu.reset();
      directoryFilter = 'all';
      searchPanel.close();
      voice.cancel();
      playback.close();
      recordingPeer = null;
      live.stop();
      emojiPicker.reset();
      updates.clear();
      automaticAttempts = 0;
      session = value;
      contacts.setSession(value);
      daily.setSession(value);
      pushSettings?.reset();
      controller.setSession(value);
      groups.setSession(value);
      selected = null;
      peers = [];
      states.clear();
      readIds.clear();
      clearContext();
      attachments.clearSelection();
      clearSessionPanels();

      message = value
        ? 'Abra os contatos e sincronize para conversar.'
        : 'Entre e autorize este aparelho para conversar.';
      renderContacts(peers);
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
      !busy &&
      !voice.active &&
      !attachments.selected?.voice &&
      groups.canActivate(),
    leave(): void {
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
      renderContacts(peers);
      renderHistory();
      status();
      if (session && navigator.onLine) void run(refresh);
      else if (!navigator.onLine) void run(refreshLocalContacts);
    },
  };
}
export type { MessageItem } from './history.ts';
export { Messages } from './controller.ts';

export type { MessageView } from './controller.ts';
