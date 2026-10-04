import { startGroups } from '../groups/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import { VoiceRecording } from '../voice-recording/index.ts';
import { voiceDuration, voiceRate } from '../../shared/voice/index.ts';
import { AttachmentUi } from '../attachment-ui/index.ts';
import type { LiveEvent } from '../message-live/index.ts';
import { LiveMessages } from '../message-live/index.ts';
import { Daily } from '../daily/index.ts';
import type { PeerState } from '../daily/index.ts';
import { dailyViews } from '../daily-text/index.ts';
import type { DailyView } from '../daily-text/index.ts';
import { messageActions } from '../message-actions/index.ts';
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
import type { Peer } from '../../shared/contacts/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { Contacts } from '../contacts/index.ts';
import { profileCard } from '../message-profile/index.ts';
import { Messages } from './controller.ts';
import type { MessageView } from './controller.ts';
type ConversationPeer = Peer & { localOnly?: boolean };
export function startMessages(
  access: VaultAccess,
  sync: VaultSync,
  options: {
    playback: VoicePlayback;
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
  const emojiPicker = new EmojiPicker();
  let peers: ConversationPeer[] = [],
    states = new Map<string, PeerState>(),
    showArchived = false;
  let composing: { mode: 'reply' | 'edit'; view: MessageView } | null = null;
  let readIds = new Set<string>();
  let searchAfter: string | null = null,
    searchQuery = '';
  let mounted: HTMLElement | null = null,
    busy = false,
    selected: ConversationPeer | null = null,
    session: AccountSession | null = null,
    rows: readonly MessageView[] | null = null,
    generation = 0,
    refreshRequested = false,
    automaticAttempts = 0,
    lastTransferAttempt = 0;
  let archivedAfter: string | null = null;
  let remoteMore = true,
    archivedMore = true;
  let failed = false;
  let settingsHost: HTMLElement | null = null;
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
    voiceButtons();
    voiceFiles();
  }
  function voiceButtons(): void {
    const start = node<HTMLButtonElement>('[data-voice-record]');
    if (start)
      start.disabled =
        busy || voice.active || attachments.selected !== null || !selected;
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
      file.disabled = busy || voice.active || !!attachments.selected?.voice;
  }
  const controller = new Messages(access, sync, (value) => {
    rows = value;
    renderHistory();
  });
  const groups = startGroups(access, sync, {
    playback,
    daily,
    run,
    changed: () => renderContacts(peers),
    peers: () => peers.filter((p) => !p.localOnly),
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
      if (event === 'authorization') {
        void checkVoiceAuthority();
        return;
      }
      if (event === 'revoked' || event === 'ended') {
        voice.cancel();
        attachments.clearSelection();
        playback.close();
      }
      if (event === 'invalidated' || event === 'revoked' || event === 'ended')
        suspend();
      else controller.hide();
      requestRefresh();
    },
  });
  function invalidateGroupAuthority(event: LiveEvent): void {
    if (['invalidated', 'revoked', 'ended'].includes(event))
      groups.suspend(event === 'revoked' || event === 'ended');
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
    return mounted?.querySelector<T>(selector) ?? null;
  }
  function status(): void {
    const immediate = node('[data-message-live]');
    if (immediate) immediate.textContent = live.notice;
    const retry = node('[data-message-refresh]');
    if (retry) retry.hidden = !failed;
    const text = node('[data-message-status]');
    if (text) text.textContent = message;
    const dailyStatus = settingsHost?.querySelector('[data-daily-status]');
    if (dailyStatus) dailyStatus.textContent = message;
    renderSoundSettings();
    mounted
      ?.querySelectorAll<
        | HTMLButtonElement
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement
      >('button,input,select,textarea')
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
    busy = true;
    failed = false;
    const current = generation;
    status();
    try {
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
      runQueuedRefresh();
    }
  }
  function runQueuedRefresh(): void {
    if (refreshRequested && mounted?.isConnected && session && navigator.onLine)
      queueMicrotask(() => {
        void run(refresh);
      });
  }
  async function resumePending(): Promise<void> {
    if (automaticAttempts >= 3 || Date.now() - lastTransferAttempt < 60000)
      return;
    lastTransferAttempt = Date.now();
    if (!(await controller.pending()).length) return;
    automaticAttempts++;
    await controller.sendPending();
  }
  function requestRefresh(): void {
    refreshRequested = true;
    automaticAttempts = 0;
    if (
      !busy &&
      mounted?.isConnected &&
      session &&
      navigator.onLine &&
      document.visibilityState === 'visible'
    )
      void run(refresh);
  }
  function peerLabel(): string {
    return (
      selected?.name || selected?.address || 'Selecione um contato aprovado'
    );
  }
  const urls: string[] = [];
  function renderHistory(): void {
    attachments.clearMedia();
    for (const url of urls.splice(0)) URL.revokeObjectURL(url);
    const history = node('[data-message-history]');
    if (!history) return;
    history.replaceChildren();
    history.hidden = rows === null;
    const gate = node('[data-message-gate]');
    if (gate) {
      gate.hidden = rows !== null;
      gate.textContent =
        'Histórico oculto até concluir a sincronização e aplicar as exclusões.';
    }
    const title = node('[data-message-peer]');
    if (title) title.textContent = peerLabel();
    const form = node('[data-message-form]');
    if (form) form.hidden = selected?.localOnly === true;
    for (const view of dailyViews(rows ?? []))
      history.append(renderMessage(view));
  }
  function messageState(view: DailyView<MessageView>): HTMLElement {
    const detail = document.createElement('small');
    const checks = messageChecks({ ...view, read: readIds.has(view.id) });
    if (checks) {
      const icon = document.createElement('span');
      icon.className = `message-checks ${checks.color}`;
      icon.textContent = checks.text;
      icon.setAttribute('role', 'img');
      icon.setAttribute('aria-label', checks.label);
      icon.title = `${checks.label}. ${view.state}`;
      detail.append(icon);
    } else detail.textContent = view.state;
    if (view.edited) detail.append(' · Editada');
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
      }),
    );
    if (view.own && !view.archived)
      article.append(
        action('Apagar para ambos', async () => {
          await controller.remove(view);
          await controller.synchronize();
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
      text.textContent = `Perfil de ${card.name}`;
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
    } else emojiText(text, view.content.text);
  }
  function choose(mode: 'reply' | 'edit', view: MessageView): void {
    composing = { mode, view };
    const label = node('[data-compose-context]');
    if (label)
      label.textContent = `${mode === 'edit' ? 'Editando' : 'Respondendo à'} mensagem ${view.id.slice(0, 8)}`;
    const text = node<HTMLTextAreaElement>('[data-message-text]');
    if (mode === 'edit' && text)
      text.value =
        dailyViews(rows ?? []).find((v) => v.id === view.id)?.content.text ??
        decodeDailyText(view.text).text;
    text?.focus();
  }
  function clearContext(): void {
    composing = null;
    const label = node('[data-compose-context]');
    if (label) label.textContent = '';
  }
  async function transmit(): Promise<void> {
    if (navigator.onLine) {
      await controller.sendPending();
      await controller.synchronize();
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
  function renderContacts(peers: Peer[]): void {
    const list = node('[data-message-contacts]');
    if (!list) return;
    list.replaceChildren();
    const conversations = [
      ...peers.map((peer) => ({
        id: peer.accountId,
        label: contactLabel(peer),
        open: () => openPeer(peer),
      })),
      ...groups.entries.map((group) => ({
        id: group.state.groupId,
        label: groups.listLabel(group),
        open: () => groups.open(group),
      })),
    ];
    const sorted = conversations
      .filter((p) => daily.conversation(p.id).archived === showArchived)
      .sort(
        (a, b) =>
          Number(daily.conversation(b.id).pinned) -
          Number(daily.conversation(a.id).pinned),
      );
    for (const conversation of sorted)
      list.append(action(conversation.label, conversation.open));
    renderPresence();
  }
  function contactLabel(peer: Peer): string {
    const state = states.get(peer.accountId),
      settings = daily.conversation(peer.accountId);
    const conflict = daily.organizationConflict(peer.accountId)
      ? ' · organização em conflito'
      : '';
    return `${settings.pinned ? '📌 ' : ''}${peer.name || peer.address}${state?.unread ? ` · ${state.unread} não lidas` : ''}${state && state.mutedUntil > Date.now() ? ' · silenciada' : ''}${conflict}`;
  }
  async function openPeer(peer: ConversationPeer): Promise<void> {
    if (
      (voice.active || attachments.selected?.voice) &&
      selected?.accountId !== peer.accountId
    )
      throw new Error(
        'Envie ou remova a prévia de voz antes de trocar de destinatário.',
      );
    showDirectConversation();
    clearContext();
    selected = peer;
    if (mounted) mounted.dataset['voicePeer'] = peer.accountId;
    controller.select(peer.accountId);
    renderHistory();
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
    await controller.synchronize();
    await controller.savePins();
    await dailyTick();
  }
  function showDirectConversation(): void {
    groups.deselect();
    const direct = node('[data-direct-conversation]');
    if (direct) direct.hidden = false;
  }
  function renderPresence(): void {
    const presence = node('[data-peer-presence]'),
      state = selected ? states.get(selected.accountId) : null;
    if (presence)
      presence.textContent = state?.online
        ? 'Online'
        : state?.lastSeen
          ? `Último acesso: ${new Date(state.lastSeen).toLocaleString('pt-BR')}`
          : 'Presença não compartilhada';
  }
  function contactsMore(): void {
    const button = node('[data-message-more-contacts]');
    if (button)
      button.hidden =
        !archivedMore &&
        (!navigator.onLine || !remoteMore) &&
        groups.next === null;
  }
  async function refreshLocalContacts(more = false): Promise<void> {
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
    await groups.refresh(more);
    renderContacts(peers);
    contactsMore();
    if (selected) await controller.openOffline(selected.accountId);
  }
  function updateSelected(combined: Map<string, ConversationPeer>): void {
    if (selected && combined.has(selected.accountId))
      selected = combined.get(selected.accountId)!;
  }
  async function refreshContacts(more = false): Promise<void> {
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
    updateSelected(combined);
    renderContacts(peers);
    contactsMore();
  }
  async function refresh(): Promise<void> {
    refreshRequested = false;
    lastTransferAttempt = Date.now();
    controller.hide();
    await controller.initialize();
    await controller.loadPins();
    await refreshContacts();
    await groups.refresh();
    contactsMore();
    await controller.sendPending();
    if (selected) {
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
  async function refreshSelected(): Promise<void> {
    if (!selected) return;
    if (selected.localOnly) {
      await controller.openArchive(selected.accountId);
      return;
    }
    const card = sharedProfile();
    if (card) await controller.shareProfile(selected.accountId, card);
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
    clearContext();
    attachments.clearSelection();
    recordingPeer = null;
    if (navigator.onLine) {
      await controller.sendPending();
      await controller.synchronize();
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
    await daily.configure(preferences());
    await daily.heartbeat(document.visibilityState === 'visible');
    if (!mounted?.isConnected) return;
    const old = states;
    states = await daily.states(peers.map((p) => p.accountId));
    alertUnread(old);
    renderContacts(peers);
    renderHistory();
    await markVisibleRead();
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
  async function markVisibleRead(): Promise<void> {
    if (
      !selected ||
      selected.localOnly ||
      rows === null ||
      document.visibilityState !== 'visible'
    )
      return;
    const incoming = rows
      .filter(
        (r) =>
          !r.own &&
          !r.archived &&
          !r.relation &&
          r.kind !== 'profile' &&
          r.state !== 'Suspensa',
      )
      .map((r) => r.id);
    if (incoming.length) await daily.read(selected.accountId, incoming);
    readIds = await daily.receipts(
      rows
        .filter(
          (r) => r.own && !r.archived && !r.relation && r.kind !== 'profile',
        )
        .map((r) => r.id),
    );
    renderHistory();
  }
  async function search(more = false): Promise<void> {
    const query = node<HTMLInputElement>('[data-message-search]')?.value ?? '';
    if (!more || query !== searchQuery) {
      searchAfter = null;
      node('[data-search-results]')?.replaceChildren();
    }
    searchQuery = query;
    const result = await controller.search(query, searchAfter);
    searchAfter = result.next;
    const list = node('[data-search-results]');
    for (const item of result.items) {
      const row = document.createElement('li');
      row.textContent = `#${item.sequence} · ${item.excerpt}`;
      list?.append(row);
    }
    const next = node('[data-search-more]');
    if (next) next.hidden = searchAfter === null;
    message =
      'Busca somente nas mensagens já sincronizadas neste aparelho; nenhum termo é enviado ao servidor.';
  }
  function suspend(): void {
    emojiPicker.close();
    controller.close();
    groups.suspend();
    rows = null;
    node('[data-search-results]')?.replaceChildren();
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
  const channel =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel('0xdmme-message-controls');
  channel?.addEventListener('message', () => {
    suspend();
    if (mounted?.isConnected && session && navigator.onLine) void run(refresh);
  });
  window.addEventListener('0xdmme-message-controls', suspend);
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
    await groups.resumePending();
  }
  const timer = setInterval(() => {
    if (
      busy ||
      !session ||
      !navigator.onLine ||
      document.visibilityState !== 'visible'
    )
      return;
    void run(async () => {
      await dailyTick();
      await groupTick();
      if (!mounted?.isConnected || !selected || selected.localOnly) return;
      await resumePending();
      if (!live.connected && (await controller.probe())) {
        await controller.synchronize();
        await controller.savePins();
      }
    });
  }, 30000);
  window.addEventListener('0xdmme-profile-preferences', () => {
    if (!busy && session && navigator.onLine) void run(dailyTick);
  });
  window.addEventListener('pagehide', (event) => {
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
      channel?.close();
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
    bind('[data-search]', () => {
      void run(() => search());
    });
    bind('[data-search-more]', () => {
      void run(() => search(true));
    });
    bind('[data-archived-list]', () => {
      showArchived = !showArchived;
      renderContacts(peers);
    });
    bind('[data-archive]', () => {
      void run(async () => {
        if (!selected) return;
        await daily.organize(selected.accountId, {
          archived: !daily.conversation(selected.accountId).archived,
        });
        await dailyTick();
      });
    });
    bind('[data-pin]', () => {
      void run(async () => {
        if (!selected) return;
        await daily.organize(selected.accountId, {
          pinned: !daily.conversation(selected.accountId).pinned,
        });
        renderContacts(peers);
      });
    });
  }
  function bindVoiceControls(): void {
    bind('[data-voice-record]', () => {
      if (busy || voice.active || attachments.selected || !selected || !session)
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
    else
      await daily.loadSettings([
        ...peers.map((p) => p.accountId),
        ...groups.entries.map((g) => g.state.groupId),
      ]);
    contactsMore();
  }
  function bindMessageControls(): void {
    bind('[data-message-refresh]', () => {
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
      sidebar = container.querySelector<HTMLElement>('[data-group-sidebar]');
    if (panel && sidebar) groups.mount(panel, sidebar);
    const direct = node('[data-direct-conversation]');
    if (direct) direct.hidden = !!groups.selected;
  }
  return {
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
      voice.cancel();
      playback.close();
      recordingPeer = null;
      live.stop();
      emojiPicker.reset();
      refreshRequested = false;
      automaticAttempts = 0;
      session = value;
      contacts.setSession(value);
      daily.setSession(value);
      controller.setSession(value);
      groups.setSession(value);
      selected = null;
      peers = [];
      states.clear();
      readIds.clear();
      clearContext();
      attachments.clearSelection();

      message = value
        ? 'Abra os contatos e sincronize para conversar.'
        : 'Entre e autorize este aparelho para conversar.';
      renderHistory();
      status();
    },
    ready(): void {
      if (session && navigator.onLine && document.visibilityState === 'visible')
        live.start();
      if (!busy && session && navigator.onLine)
        void run(
          mounted?.isConnected
            ? refresh
            : async () => {
                await controller.initialize();
                await dailyTick();
              },
        );
    },
    canActivate: () =>
      !busy &&
      !voice.active &&
      !attachments.selected?.voice &&
      groups.canActivate(),
    leave(): void {
      groups.leave();
      if (voice.active)
        void voice.stop(
          'Navegação interrompeu a gravação; trecho preservado para conferir ao voltar à conversa.',
        );
      attachments.clearMedia();
      attachments.pausePreview();
    },
    mountSettings(container: HTMLElement): void {
      settingsHost = container;
      container.innerHTML = `<article class="card notifications-card"><h2>Notificações</h2><p>Alertas exibem apenas “0xDMme” e atividade genérica. O serviço push do navegador recebe endereço de inscrição e horários, sem texto, wallet ou nome de contato.</p><p>No iPhone/iPad, adicione o app à tela inicial e abra pelo ícone antes de ativar. A permissão depende de um toque seu e pode ser alterada nas configurações do sistema.</p><p data-daily-status role="status"></p><p>Silêncio da conversa selecionada: <span data-mute-peer></span></p><label>Silenciar<select data-mute-duration><option value="0">Retomar alertas</option><option value="3600000">1 hora</option><option value="28800000">8 horas</option><option value="86400000">24 horas</option><option value="604800000">7 dias</option><option value="9007199254740991">Até reativar</option></select></label><button data-mute type="button">Salvar silêncio</button><button data-push-enable type="button">Ativar push neste aparelho</button><button data-push-disable type="button">Desativar push neste aparelho</button><button data-sound-toggle type="button" aria-pressed="true">Desativar sons</button><p data-sound-status role="status"></p><p>Sons ligados por padrão. Sua escolha é salva neste navegador e continua ao trocar de conta ou reabrir o app. O navegador pode aguardar um toque para liberar áudio; volume e som de push seguem o sistema. Conversas silenciadas ou arquivadas continuam sem alertas. Offline ou sem sessão válida, não há alerta remoto novo.</p></article>`;
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
        );
      });
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
    mount(container: HTMLElement): void {
      mounted = container;
      container.innerHTML = `<article class="card chat-panel"><h2>Conversas</h2><p data-message-status role="status"></p><p data-message-live role="status"></p><button data-message-refresh type="button" hidden>Tentar novamente</button><div class="chat-layout"><aside><h3>Conversas</h3><div data-group-sidebar></div><button data-archived-list type="button">Alternar arquivadas</button><div data-message-contacts class="chat-contacts"></div><button data-message-more-contacts type="button" hidden>Mais conversas</button></aside><section data-direct-conversation><h3 data-message-peer></h3><p data-peer-presence></p><button data-archive type="button">Arquivar/desarquivar</button><p>Arquivar silencia até reativar. Depois de desarquivar, vá a Configurações → Retomar alertas para voltar a receber notificações.</p><button data-pin type="button">Fixar/desfixar</button><p data-message-gate></p><div data-message-history class="chat-history" hidden></div><button data-message-older type="button">Mensagens anteriores</button><form data-message-form><p data-compose-context></p><button data-compose-cancel type="button">Cancelar resposta/edição</button><label>Mensagem<textarea data-message-text rows="3"></textarea></label><button data-message-emoji type="button">Escolher emoji</button><label>Enviar como<select data-attachment-mode><option value="photo">Foto otimizada</option><option value="file">Arquivo original (até 3 MB)</option></select></label><button data-voice-record type="button">Gravar voz</button><button data-voice-stop type="button" hidden>Parar e conferir</button><button data-voice-cancel type="button" hidden>Cancelar gravação</button><p data-voice-status role="status"></p><p>Voz: até 90 segundos. Ouça a prévia e toque em Enviar. Se o sistema interromper o microfone, o trecho capturado será preservado enquanto esta página continuar aberta.</p><label>Foto ou arquivo<input data-attachment-file type="file"></label><p>Foto: prévia e remoção de metadados no aparelho. Original: pode compartilhar GPS/EXIF. Vídeos ainda não são aceitos.</p><div data-attachment-preview></div><button data-attachment-clear type="button">Remover seleção</button><button class="primary" type="submit">Enviar</button></form><label>Busca local<input data-message-search maxlength="128" type="search"></label><button data-search type="button">Buscar neste aparelho</button><button data-search-more type="button" hidden>Continuar busca</button><ul data-search-results></ul><h3>Envios deste aparelho</h3><ul data-message-pending></ul></section><section data-group-conversation hidden></section></div></article>`;
      if (selected) container.dataset['voicePeer'] = selected.accountId;
      attachments.mount(container, run);
      mountGroups(container);
      bindVoiceControls();
      bindDailyControls();
      bindMessageControls();
      renderHistory();
      status();
      if (session && navigator.onLine) void run(refresh);
      else void run(refreshLocalContacts);
    },
  };
}
export type { MessageItem } from './history.ts';
export { Messages } from './controller.ts';

export type { MessageView } from './controller.ts';
