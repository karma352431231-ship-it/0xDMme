import { EmojiPicker } from '../emoji/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { dmMessageMenu, dmReactionChips } from './dm-message-menu.ts';
import { clearDmChecks, refreshDmChecks } from './dm-checks.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { publicProfile } from '../../shared/public-profile/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import { socialRelation } from '../../shared/social-dm/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import { AttachmentUi } from '../attachment-ui/index.ts';
import { VoicePlayback } from '../voice-playback/index.ts';
import { LiveMessages } from '../message-live/index.ts';
import { socialAttachment } from '../../shared/social-media/index.ts';
import { SocialDms } from '../social-dm/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { historyPosition, resetHistoryPosition } from '../chat-ui/index.ts';
import { communityElement } from './elements.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import {
  dmBubble,
  dmConversationView,
  dmListView,
  dmRequestState,
  dmStateLabel,
  paintDmPeer,
} from './dm-chat.ts';
import type { DmRequestAction, DmView } from './dm-chat.ts';
import { startDmComposer } from './dm-composer.ts';
import { DmWork } from './dm-work.ts';
import { bindDmLifecycle } from './dm-lifecycle.ts';
import {
  DmDirectory,
  dmDirectoryRow as directoryRow,
  paintDmDirectoryPreviews,
} from './dm-directory.ts';
import { LiveUpdates } from '../message-live/index.ts';

type DmPage = Awaited<ReturnType<SocialDms['cached']>>;
type DmItem = DmPage['items'][number];

export function startSocialDmUi(
  access: VaultAccess,
  sync: VaultSync,
  privacy: ExternalMediaConsent,
) {
  const controller = new SocialDms(access, sync);
  const publicDirectory = new DmDirectory({
    list: () => controller.list(null),
    previews: (peers) => controller.directoryPreviews(peers),
  });
  const emojiPicker = new EmojiPicker();
  const playback = new VoicePlayback(),
    mediaUi = new AttachmentUi(playback, () => {});
  const composer = startDmComposer({
    playback,
    privacy,
    run,
    changed: () => refreshes.resume(),
    submit: async ({ text, media, pending }) => {
      const selected = peer;
      if (!selected) return;
      if (composer.editing) {
        await controller.edit(selected, composer.editing, text);
      } else if (media) {
        await controller.stageMedia(
          selected,
          media.selection,
          media.media,
          text.trim(),
        );
        await controller.sendMedia(selected);
      } else {
        if (pending) await controller.sendMedia(selected);
        if (text.trim()) await sendText(selected, text);
      }
      before = null;
      await conversation();
    },
    discardPending: async () => {
      if (peer) await controller.cancelMedia(peer);
    },
  });
  const live = new LiveMessages({
    access,
    event: (event) => {
      if (!container && !publicDirectory.available) return;
      if (
        [
          'removed',
          'authorization',
          'invalidated',
          'revoked',
          'ended',
        ].includes(event)
      ) {
        publicDirectory.invalidate();
        closeGate();
      }
      refreshes.request();
    },
    changed: () => {
      if (!live.current) {
        publicDirectory.invalidate();
        if (container) closeGate();
      }
    },
  });
  const workQueue = new DmWork();
  const refreshes = new LiveUpdates({
    available: () =>
      (!!container || publicDirectory.available) && !busy && !composer.active,
    run: () => {
      void run(reload);
    },
  });
  let fallback: ReturnType<typeof setInterval> | null = null;
  let stopLifecycle: (() => void) | null = null;
  function startLifecycle(): void {
    stopLifecycle ??= bindDmLifecycle({
      current: () => live.current,
      pause: () => {
        publicDirectory.invalidate();
        closeGate();
      },
      refresh: () => refreshes.request(),
      reconnect: () => live.retry(),
    });
  }
  function startFallback(): void {
    if (fallback !== null) return;
    fallback = setInterval(() => {
      if (closeIdleDirectory()) return;
      if (
        (!container && !publicDirectory.available) ||
        busy ||
        composer.active ||
        live.connected ||
        document.visibilityState !== 'visible'
      )
        return;
      refreshes.request();
    }, 30000);
  }
  function closeIdleDirectory(): boolean {
    if (container || publicDirectory.available) return false;
    publicDirectory.clear();
    stopLifecycle?.();
    stopLifecycle = null;
    live.stop();
    if (fallback) clearInterval(fallback);
    fallback = null;
    return true;
  }
  let container: HTMLElement | null = null,
    session: AccountSession | null = null,
    view: DmView | null = null,
    viewKey = '';
  let generation = 0,
    verification = 0,
    busy = false,
    peer: string | null = null,
    cursor: string | null = null,
    before: number | null = null,
    nextBefore: number | null = null;
  let messageId: string = crypto.randomUUID();
  let ownProfile: string | null = null;
  let localOnly = false;
  let externalAbort = new AbortController();
  const rows = new Map<
    string,
    { key: string; row: HTMLElement; stop: () => void }
  >();
  function clearRows(): void {
    externalAbort.abort();
    externalAbort = new AbortController();
    for (const held of rows.values()) held.stop();
    rows.clear();
    mediaUi.clearMedia();
  }
  function status(message: string): void {
    if (view) view.gate.textContent = message;
    else if (container)
      container.replaceChildren(communityElement('p', message, 'chat-gate'));
  }
  async function run(work: () => Promise<void>): Promise<void> {
    const old = generation;
    await workQueue.run(async () => {
      if (old !== generation) return;
      busy = true;
      composer.update(composerState());
      try {
        await work();
      } catch (error: unknown) {
        if (old === generation) {
          closeGate();
          status(
            error instanceof Error
              ? translatedError(error.message)
              : t('DM indisponível.'),
          );
        }
      } finally {
        busy = false;
        if (old === generation) composer.update(composerState());
        refreshes.resume();
      }
    });
  }
  function closeGate(): void {
    verification++;
    controller.cancel();
    writable = false;
    clearRows();
    if (view) {
      view.history.replaceChildren();
      view.history.hidden = true;
      clearDmChecks(view.history);
    }
    composer.cancelEdit();
    playback.close();
    composer.update(composerState());
  }
  let writable = false,
    pendingMedia = false;
  function composerState() {
    return { writable, pending: pendingMedia, busy };
  }
  async function reload(): Promise<void> {
    if (!container) {
      await publicDirectory.refresh();
      return;
    }
    if (peer) await conversation();
    else {
      cursor = null;
      await list();
    }
    if (publicDirectory.available) await publicDirectory.refresh();
  }
  async function sendText(selected: string, text: string): Promise<void> {
    await controller.send(selected, text, messageId);
    messageId = crypto.randomUUID();
  }
  async function list(): Promise<void> {
    if (!container) return;
    const old = generation,
      offline = localOnly || !navigator.onLine,
      page = offline ? null : await controller.list(cursor);
    if (old !== generation || !container) return;
    view = null;
    viewKey = '';
    const host = dmListView(container);
    if (page) {
      listRows(host, page);
      await listPreviews(
        host,
        page.items.map((row) => row.peer.id),
        old,
      );
    }
    await copiesList(host);
    cursor = page?.next ?? null;
    if (cursor) moreButton(host, t('Mais conversas'), list);
  }
  function listRows(
    host: HTMLElement,
    page: Awaited<ReturnType<SocialDms['list']>>,
  ): void {
    for (const row of page.items) host.append(directoryRow(row));
    if (!page.items.length)
      host.append(
        communityElement(
          'p',
          t(
            'Nenhuma conversa @ ainda. Abra um perfil público para mandar mensagem.',
          ),
          'chat-gate',
        ),
      );
  }
  async function listPreviews(
    host: HTMLElement,
    peers: readonly string[],
    old: number,
  ): Promise<void> {
    try {
      const previews = await controller.directoryPreviews(peers);
      if (old !== generation) return;
      paintDmDirectoryPreviews(host, previews);
    } catch (error: unknown) {
      if (old === generation)
        status(
          error instanceof Error
            ? translatedError(error.message)
            : t('preview.unavailable'),
        );
    }
  }
  async function copiesList(
    host: HTMLElement,
    after: string | null = null,
  ): Promise<void> {
    const old = generation,
      page = await controller.copies(after);
    if (old !== generation) return;
    if (page.items.length && !after)
      host.append(communityElement('h4', t('Neste aparelho'), 'dm-list-title'));
    for (const row of page.items)
      host.append(
        directoryRow(
          { peer: row.peer, label: t('Cópia local') },
          `&history=local`,
        ),
      );
    if (page.next)
      moreButton(host, t('Mais cópias locais'), () =>
        copiesList(host, page.next),
      );
  }
  function moreButton(
    host: HTMLElement,
    label: string,
    work: () => Promise<void>,
  ): void {
    const button = communityElement('button', label, 'chat-older');
    button.type = 'button';
    button.addEventListener('click', () => {
      button.remove();
      void run(work);
    });
    host.append(button);
  }
  async function identity(id: string): Promise<PublicProfile> {
    // UUID is not a directory of private contacts. Only already-approved public identities are returned.
    const page = await controller.list(null);
    const known = page.items.find((row) => row.peer.id === id);
    if (known) return known.peer;
    return publicProfile(await controller.request('profile', { peer: id }));
  }
  /** One frame per conversation: refreshes update it in place. */
  function frame(selected: string): DmView {
    const key = `${selected}:${localOnly}`;
    if (view && viewKey === key && container?.contains(view.panel)) return view;
    if (!container) throw new Error('DM encerrada.');
    composer.leave();
    clearRows();
    view = dmConversationView(container);
    viewKey = key;
    resetHistoryPosition(view.history);
    composer.bind(view);
    view.older.addEventListener('click', () => {
      void run(async () => {
        before = nextBefore;
        await conversation();
      });
    });
    return view;
  }
  /** What the server (or, offline, this device) knows about the conversation. */
  async function loadConversation(selected: string) {
    const offline = localOnly || !navigator.onLine;
    if (offline) {
      const page = await controller.cached(selected, before);
      return {
        offline,
        value: null,
        page,
        profile: page.items[0]?.peer ?? null,
      };
    }
    const value = await controller.state(selected);
    return {
      offline,
      value,
      page: null,
      profile: value?.peer ?? (await identity(selected)),
    };
  }
  async function conversation(): Promise<void> {
    const selected = peer;
    if (!selected || !container) return;
    const old = generation,
      expected = verification,
      data = await loadConversation(selected);
    if (old !== generation || expected !== verification || !container) return;
    const current = frame(selected);
    current.gate.textContent = '';
    paintHeader(current, data);
    options(current, selected, data.profile, data.value);
    const request = dmRequestState({
      value: data.value,
      own: ownProfile,
      local: data.offline,
      canRequest: !data.offline && canRequest(data.value),
      handle: data.profile?.handle ?? '',
    });
    requestBanner(current, selected, data.value, request);
    writable = !data.offline && request === null;
    await messages(current, selected, old, data.page);
  }
  function paintHeader(
    current: DmView,
    data: Awaited<ReturnType<typeof loadConversation>>,
  ): void {
    if (!data.profile) {
      current.title.textContent = t('Histórico de DM no aparelho');
      return;
    }
    paintDmPeer(current, {
      profile: data.profile,
      state: dmStateLabel(data.value, ownProfile, data.offline),
      signal: externalAbort.signal,
    });
  }
  async function messages(
    current: DmView,
    selected: string,
    old: number,
    cached: DmPage | null,
  ): Promise<void> {
    const expected = verification;
    const page =
      cached ??
      (writable
        ? await controller.read(selected, before)
        : await controller.cached(selected, before));
    const draft = writable ? await controller.pending(selected) : null;
    pendingMedia = writable ? await controller.mediaDraft(selected) : false;
    if (old !== generation || expected !== verification) return;
    if (draft) {
      messageId = draft.id;
      composer.restoreDraft(draft.text);
    }
    renderHistory(current, page, { selected, localMedia: !writable });
    current.history.hidden = false;
    composer.update(composerState());
    if (writable)
      await refreshDmChecks({
        history: current.history,
        controller,
        peer: selected,
        items: page.items,
        reactionReads: page.reactionReads,
        usable: () =>
          old === generation && writable && current.history.isConnected,
      });
  }
  function options(
    current: DmView,
    selected: string,
    profile: PublicProfile | null,
    value: SocialRelation | null,
  ): void {
    current.options.replaceChildren();
    if (profile) {
      const link = communityElement('a', t('Ver perfil público'));
      link.href = `#users?handle=${encodeURIComponent(profile.handle)}`;
      current.options.append(link);
    }
    if (localOnly || !navigator.onLine) return;
    const blocked = value?.blocked ?? false;
    optionButton(
      current,
      blocked ? t('Desbloquear') : t('Bloquear'),
      async () => {
        await controller.request('block', {
          peer: selected,
          blocked: !blocked,
          revision: value?.blockRevision ?? 0,
        });
        before = null;
        await conversation();
      },
    );
    optionButton(current, t('Recarregar conversa'), async () => {
      before = null;
      await conversation();
    });
  }
  function optionButton(
    current: DmView,
    label: string,
    work: () => Promise<void>,
  ): void {
    const button = communityElement('button', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      button.closest('details')?.removeAttribute('open');
      void run(work);
    });
    current.options.append(button);
  }
  function requestBanner(
    current: DmView,
    selected: string,
    value: SocialRelation | null,
    request: ReturnType<typeof dmRequestState>,
  ): void {
    current.request.hidden = request === null;
    current.request.replaceChildren();
    if (!request) return;
    current.request.append(communityElement('p', request.text));
    const labels: Record<DmRequestAction, string> = {
      request: t('Solicitar DM'),
      accept: t('Aceitar'),
      reject: t('Recusar'),
    };
    for (const action of request.actions) {
      const button = communityElement(
        'button',
        labels[action],
        action === 'reject' ? '' : 'primary',
      );
      button.type = 'button';
      button.addEventListener('click', () => {
        void run(() => decide(selected, value, action));
      });
      current.request.append(button);
    }
  }
  async function decide(
    selected: string,
    value: SocialRelation | null,
    action: DmRequestAction,
  ): Promise<void> {
    if (action === 'request')
      socialRelation(await controller.request('request', { peer: selected }));
    else if (value)
      await controller.request('decide', {
        peer: selected,
        revision: value.revision,
        accept: action === 'accept',
      });
    await conversation();
  }
  function canRequest(value: SocialRelation | null): boolean {
    return (
      !value ||
      ((value.state === 'none' || value.state === 'rejected') &&
        !value.blocked &&
        value.requester !== ownProfile)
    );
  }
  /**
   * Rows are reused by id and content, so a refresh neither reloads media nor
   * restarts an embedded video; only new or changed messages are drawn.
   */
  function renderHistory(
    current: DmView,
    page: DmPage,
    input: { selected: string; localMedia: boolean },
  ): void {
    const restore = historyPosition(current.history);
    const keep = new Set(page.items.map((item) => item.id));
    for (const [id, held] of rows)
      if (!keep.has(id)) {
        held.stop();
        held.row.remove();
        rows.delete(id);
      }
    for (const child of [...current.history.children])
      if (!(child instanceof HTMLElement) || !child.dataset['message'])
        child.remove();
    let cursorNode = current.history.firstChild;
    for (const item of page.items) {
      const row = messageRow(item, page, input);
      if (row === cursorNode) cursorNode = row.nextSibling;
      else current.history.insertBefore(row, cursorNode);
    }
    if (!page.items.length)
      current.gate.textContent = t('Nenhuma mensagem ainda.');
    current.older.hidden = page.next === null;
    nextBefore = page.next;
    restore();
  }
  function messageRow(
    item: DmItem,
    page: DmPage,
    input: { selected: string; localMedia: boolean },
  ): HTMLElement {
    const key = JSON.stringify([
        item.kind,
        item.text,
        item.reactions,
        item.ownReaction,
        item.sentAt,
        item.displayText,
        item.edited,
        input.localMedia,
      ]),
      held = rows.get(item.id);
    if (held?.key === key) return held.row;
    held?.stop();
    held?.row.remove();
    const handle = item.peer.handle,
      bubble = dmBubble(
        { ...item, text: item.displayText },
        {
          own: item.sender === page.self,
          handle,
          privacy,
          signal: externalAbort.signal,
        },
      );
    if (item.kind === 'attachment' && item.media)
      mediaUi.render({
        article: bubble.row,
        view: { ...item, peer: input.selected, archived: input.localMedia },
        saveNotice: t(
          'A cópia salva fica fora do cofre e da limpeza pessoal. Abra arquivos somente se confiar na origem.',
        ),
        content: socialAttachment(JSON.parse(item.text) as unknown, item.media),
        load: (_view, thumbnail) =>
          controller.media(item, thumbnail, false, input.localMedia),
        run,
      });
    const stopMenu = dmMessageMenu(bubble.row, {
      text:
        item.kind === 'text'
          ? item.text
          : socialAttachment(JSON.parse(item.text) as unknown, item.media!)
              .caption,
      signal: externalAbort.signal,
      picker: emojiPicker,
      run,
      ...(!input.localMedia
        ? {
            react: (emoji: string) => react(item, emoji),
            edit: () => composer.edit(item),
            editable: editable(item),
          }
        : {}),
    });
    dmReactionChips(bubble.row, {
      reactions: item.reactions,
      ownReaction: item.ownReaction,
      run,
      ...(!input.localMedia ? { react: () => react(item, '') } : {}),
    });
    rows.set(item.id, {
      key,
      row: bubble.row,
      stop: () => {
        stopMenu();
        bubble.stop();
      },
    });
    return bubble.row;
  }
  async function react(item: DmItem, emoji: string): Promise<void> {
    const target = peer;
    if (!target || !writable) return;
    await controller.react(target, item, emoji);
    await conversation();
  }
  function editable(item: DmItem): boolean {
    return item.own && item.kind === 'text';
  }
  function leave(): void {
    if (!publicDirectory.available) {
      stopLifecycle?.();
      stopLifecycle = null;
    }
    workQueue.reset();
    refreshes.clear();
    if (view) clearDmChecks(view.history);
    emojiPicker.reset();
    clearRows();
    composer.leave();
    if (!publicDirectory.available) {
      live.stop();
      if (fallback) clearInterval(fallback);
      fallback = null;
    }
    playback.close();
    generation++;
    controller.cancel();
    container = null;
    view = null;
    viewKey = '';
    writable = false;
    pendingMedia = false;
    messageId = crypto.randomUUID();
  }
  return {
    mount(node: HTMLElement, id: string | null, local = false): void {
      leave();
      container = node;
      peer = id;
      localOnly = local;
      if (!localOnly) startLifecycle();
      cursor = null;
      before = null;
      nextBefore = null;
      if (!session) {
        node.replaceChildren(
          communityElement(
            'p',
            t('Entre pelo Perfil para abrir suas mensagens pelo @.'),
            'chat-gate',
          ),
        );
        return;
      }
      status(id ? t('Abrindo conversa…') : t('Carregando mensagens pelo @…'));
      const old = generation;
      void run(async () => {
        const profile =
          navigator.onLine && !localOnly
            ? (ownProfile ?? (await controller.initialize()))
            : ownProfile;
        if (old !== generation) return;
        ownProfile = profile;
        if (navigator.onLine && !localOnly) live.start();
        if (navigator.onLine && !localOnly) startFallback();
        await reload();
      });
    },
    leave,
    setSession(value: AccountSession | null): void {
      if (sameSession(value, session)) return;
      const node = container;
      publicDirectory.clear();
      leave();
      session = value;
      ownProfile = null;
      controller.setSession(value);
      node?.replaceChildren();
    },
    canActivate: () => !busy && !composer.active,
    /** Public identity only, independently live in the contact directory. */
    async directory(node: HTMLElement, valid: () => boolean): Promise<void> {
      if (!session) {
        node.replaceChildren(
          communityElement(
            'p',
            t('Entre pela wallet para ver suas mensagens @.'),
          ),
        );
        return;
      }
      live.start();
      startLifecycle();
      startFallback();
      await run(() => publicDirectory.mount(node, valid));
    },
  };
}
function sameSession(
  a: AccountSession | null,
  b: AccountSession | null,
): boolean {
  return (
    a?.accountId === b?.accountId &&
    a?.deviceId === b?.deviceId &&
    a?.csrf === b?.csrf
  );
}
