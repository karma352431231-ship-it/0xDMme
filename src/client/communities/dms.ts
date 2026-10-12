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
import { paintAvatar } from '../appearance/index.ts';
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

type DmPage = Awaited<ReturnType<SocialDms['cached']>>;
type DmItem = DmPage['items'][number];

export function startSocialDmUi(
  access: VaultAccess,
  sync: VaultSync,
  privacy: ExternalMediaConsent,
) {
  const controller = new SocialDms(access, sync);
  const playback = new VoicePlayback(),
    mediaUi = new AttachmentUi(playback, () => {});
  const composer = startDmComposer({
    playback,
    privacy,
    run,
    submit: async ({ text, media, pending }) => {
      const selected = peer;
      if (!selected) return;
      if (media) {
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
      if (!container || busy || composer.active) return;
      if (['ready', 'changed', 'authorization', 'invalidated'].includes(event))
        void run(async () => {
          await playback.check((target) =>
            controller.state(target).then((state) => state?.canSend ?? false),
          );
          await reload();
        });
    },
    changed: () => {},
  });
  let fallback: ReturnType<typeof setInterval> | null = null;
  function startFallback(): void {
    fallback = setInterval(() => {
      if (
        !container ||
        busy ||
        composer.active ||
        live.connected ||
        document.visibilityState !== 'visible'
      )
        return;
      void run(reload);
    }, 30000);
  }
  let container: HTMLElement | null = null,
    session: AccountSession | null = null,
    view: DmView | null = null,
    viewKey = '';
  let generation = 0,
    busy = false,
    peer: string | null = null,
    cursor: string | null = null,
    before: number | null = null;
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
    if (busy) return;
    const old = generation;
    busy = true;
    composer.update({ ...composerState(), busy: true });
    try {
      await work();
    } catch (error: unknown) {
      if (old === generation)
        status(error instanceof Error ? error.message : 'DM indisponível.');
    } finally {
      busy = false;
      if (old === generation) composer.update(composerState());
    }
  }
  let writable = false,
    pendingMedia = false;
  function composerState() {
    return { writable, pending: pendingMedia, busy };
  }
  async function reload(): Promise<void> {
    if (peer) await conversation();
    else {
      cursor = null;
      await list();
    }
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
    if (page) listRows(host, page);
    await copiesList(host);
    cursor = page?.next ?? null;
    if (cursor) moreButton(host, 'Mais conversas', list);
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
          'Nenhuma conversa @ ainda. Abra um perfil público para mandar mensagem.',
          'chat-gate',
        ),
      );
  }
  async function copiesList(
    host: HTMLElement,
    after: string | null = null,
  ): Promise<void> {
    const old = generation,
      page = await controller.copies(after);
    if (old !== generation) return;
    if (page.items.length && !after)
      host.append(communityElement('h4', 'Neste aparelho', 'dm-list-title'));
    for (const row of page.items)
      host.append(
        directoryRow(
          { peer: row.peer, label: 'Cópia local' },
          `&history=local`,
        ),
      );
    if (page.next)
      moreButton(host, 'Mais cópias locais', () => copiesList(host, page.next));
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
      data = await loadConversation(selected);
    if (old !== generation || !container) return;
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
      current.title.textContent = 'Histórico de DM no aparelho';
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
    const page =
      cached ??
      (writable
        ? await controller.read(selected, before)
        : await controller.cached(selected, before));
    const draft = writable ? await controller.pending(selected) : null;
    pendingMedia = writable ? await controller.mediaDraft(selected) : false;
    if (old !== generation) return;
    if (draft) {
      messageId = draft.id;
      composer.restoreDraft(draft.text);
    }
    renderHistory(current, page, { selected, localMedia: !writable });
    composer.update(composerState());
  }
  function options(
    current: DmView,
    selected: string,
    profile: PublicProfile | null,
    value: SocialRelation | null,
  ): void {
    current.options.replaceChildren();
    if (profile) {
      const link = communityElement('a', 'Ver perfil público');
      link.href = `#publico?handle=${encodeURIComponent(profile.handle)}`;
      current.options.append(link);
    }
    if (localOnly || !navigator.onLine) return;
    const blocked = value?.blocked ?? false;
    optionButton(current, blocked ? 'Desbloquear' : 'Bloquear', async () => {
      await controller.request('block', {
        peer: selected,
        blocked: !blocked,
        revision: value?.blockRevision ?? 0,
      });
      before = null;
      await conversation();
    });
    optionButton(current, 'Recarregar conversa', async () => {
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
      request: 'Solicitar DM',
      accept: 'Aceitar',
      reject: 'Recusar',
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
      current.gate.textContent = 'Nenhuma mensagem ainda.';
    current.older.hidden = page.next === null;
    before = page.next;
    restore();
  }
  function messageRow(
    item: DmItem,
    page: DmPage,
    input: { selected: string; localMedia: boolean },
  ): HTMLElement {
    const key = `${item.kind}:${item.text}:${input.localMedia}`,
      held = rows.get(item.id);
    if (held?.key === key) return held.row;
    held?.stop();
    held?.row.remove();
    const handle = item.peer.handle,
      bubble = dmBubble(item, {
        own: item.sender === page.self,
        handle,
        privacy,
        signal: externalAbort.signal,
      });
    if (item.kind === 'attachment' && item.media)
      mediaUi.render({
        article: bubble.row,
        view: { ...item, peer: input.selected, archived: input.localMedia },
        saveNotice:
          'A cópia salva fica fora do cofre e da limpeza pessoal. Abra arquivos somente se confiar na origem.',
        content: socialAttachment(JSON.parse(item.text) as unknown, item.media),
        load: (_view, thumbnail) =>
          controller.media(item, thumbnail, false, input.localMedia),
        run,
      });
    rows.set(item.id, { key, ...bubble });
    return bubble.row;
  }
  function leave(): void {
    clearRows();
    composer.leave();
    live.stop();
    if (fallback) clearInterval(fallback);
    fallback = null;
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
      cursor = null;
      before = null;
      if (!session) {
        node.replaceChildren(
          communityElement(
            'p',
            'Entre pelo Perfil para abrir suas mensagens pelo @.',
            'chat-gate',
          ),
        );
        return;
      }
      status(id ? 'Abrindo conversa…' : 'Carregando mensagens pelo @…');
      const old = generation;
      void run(async () => {
        const profile =
          navigator.onLine && !localOnly ? await controller.initialize() : null;
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
      leave();
      session = value;
      ownProfile = null;
      controller.setSession(value);
      node?.replaceChildren();
    },
    canActivate: () => !busy && !composer.active,
    /** Public @ conversations for the Contatos → Públicos list; handles and states only. */
    async directory(node: HTMLElement, valid: () => boolean): Promise<void> {
      if (!session) {
        node.append(
          communityElement('p', 'Entre pela wallet para ver suas mensagens @.'),
        );
        return;
      }
      try {
        const page = await controller.list(null);
        if (!valid()) return;
        for (const row of page.items) node.append(directoryRow(row));
        if (!page.items.length)
          node.append(
            communityElement(
              'p',
              'Nenhuma conversa @ ainda. Abra um perfil público para mandar mensagem.',
            ),
          );
        const all = communityElement('a', 'Todas as mensagens @ e pedidos');
        all.href = '#comunidades?view=dms';
        node.append(all);
      } catch (error: unknown) {
        if (valid())
          node.append(
            communityElement(
              'p',
              error instanceof Error ? error.message : 'DMs indisponíveis.',
            ),
          );
      }
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

/** Conversation list row, the same as the private conversations list. */
function directoryRow(
  row: SocialRelation | { peer: PublicProfile; label: string },
  extra = '',
): HTMLAnchorElement {
  const link = communityElement('a', '', 'conversation-row public-row');
  link.href = `#comunidades?view=dms&dm=${row.peer.id}${extra}`;
  const avatar = communityElement('span', '', 'conversation-avatar');
  avatar.setAttribute('aria-hidden', 'true');
  paintAvatar(avatar, { label: row.peer.handle, seed: row.peer.id });
  const copy = communityElement('span', '', 'conversation-copy');
  copy.append(
    communityElement('strong', `@${row.peer.handle}`),
    communityElement('small', 'label' in row ? row.label : relationLabel(row)),
  );
  link.append(avatar, copy);
  return link;
}
function relationLabel(row: SocialRelation): string {
  if (row.blocked) return 'Bloqueada';
  return {
    approved: 'Conversa',
    pending: 'Solicitação',
    rejected: 'Recusada',
    none: 'Sem consentimento',
  }[row.state];
}
