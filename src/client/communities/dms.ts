import { dmFailure } from './dm-failures.ts';
import { measureWork } from '../synchronization-diagnostics/index.ts';
import { DmProjections } from './dm-projections.ts';
import { DmContinuations } from './dm-continuation.ts';
import { EmojiPicker } from '../emoji/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { dmMessageMenu, dmReactionChips } from './dm-message-menu.ts';
import { clearDmChecks } from './dm-checks.ts';
import { readVisibleDm } from './dm-read.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { publicProfile } from '../../shared/public-profile/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import { AttachmentUi } from '../attachment-ui/index.ts';
import { VoicePlayback } from '../voice-playback/index.ts';
import { LiveMessages, scopedLiveEvent } from '../message-live/index.ts';
import { socialAttachment } from '../../shared/social-media/index.ts';
import { SocialDms } from '../social-dm/index.ts';
import type {
  VaultAccess,
  VaultWorkOptions,
} from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { historyPosition, resetHistoryPosition } from '../chat-ui/index.ts';
import { communityElement } from './elements.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import {
  dmBubble,
  dmConversationView,
  dmListView,
  dmComposerGate,
  dmStateLabel,
  paintDmPeer,
} from './dm-chat.ts';
import type { DmView } from './dm-chat.ts';
import { openDmConversation, dmConversationWork } from './dm-opening.ts';
import { startDmComposer } from './dm-composer.ts';
import { DmWork } from './dm-work.ts';
import { bindDmLifecycle } from './dm-lifecycle.ts';
import {
  DmDirectory,
  dmDirectoryRow as directoryRow,
  paintDmDirectoryPreviews,
} from './dm-directory.ts';
import { LiveUpdates } from '../message-live/index.ts';
import { createDmInbox } from './dm-inbox.ts';
import type { LiveEvent } from '../message-live/index.ts';
import { withMenuIcon } from '../menu-icons/index.ts';
import type { MenuIconName } from '../menu-icons/index.ts';

type DmPage = Awaited<ReturnType<SocialDms['cached']>>;
type DmItem = DmPage['items'][number];

export function startSocialDmUi(
  access: VaultAccess,
  sync: VaultSync,
  privacy: ExternalMediaConsent,
  unreadChanged: (count: number) => void = () => {},
) {
  const controller = new SocialDms(access, sync);
  const unread = createDmInbox(controller, unreadChanged);
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
      if (selected !== peer) return;
      before = null;
      await conversation();
    },
    discardPending: async () => {
      if (peer) await controller.cancelMedia(peer);
    },
  });
  let streamCurrent = false;
  const live = new LiveMessages({
    access,
    event: (signal) => {
      const event = scopedLiveEvent(signal, [
        'handle-messages',
        'handle-receipts',
      ]);
      if (!event) return;
      if (event === 'call') return;
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
      const current = live.current;
      if (streamCurrent && !current) {
        publicDirectory.invalidate();
        closeGate();
        refreshes.request();
      }
      streamCurrent = current;
      refreshes.resume();
    },
  });
  const projections = new DmProjections();
  const workQueue = new DmWork();
  const continuations = new DmContinuations({
    available: () =>
      !!session &&
      (!!container || publicDirectory.available) &&
      !busy &&
      !composer.active &&
      !live.connecting &&
      navigator.onLine &&
      document.visibilityState === 'visible',
    run: () => {
      void run(reload);
    },
  });
  const refreshes = new LiveUpdates({
    available: () =>
      (!!container || publicDirectory.available) &&
      document.visibilityState === 'visible' &&
      !busy &&
      !composer.active &&
      !live.connecting,
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
      visible: () => refreshes.resume(),
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
    const old = generation,
      account = session,
      queuedAt = performance.now();
    await workQueue.run(async () => {
      if (old !== generation) return;
      const expected = verification;
      busy = true;
      composer.update(composerState());
      try {
        await measureWork(controller, 'dm-foreground', work, queuedAt);
        continuations.clear();
      } catch (error: unknown) {
        const failure = dmFailure(error, {
          sameSession: sameSession(account, session),
          current: old === generation && expected === verification,
        });
        if (failure === 'continue') continuations.request();
        else if (failure !== 'ignore') {
          closeGate();
          status(
            error instanceof Error
              ? translatedError(error.message)
              : t('DM unavailable.'),
          );
        }
      } finally {
        busy = false;
        if (old === generation) composer.update(composerState());
        refreshes.resume();
        continuations.resume();
      }
    });
  }
  function closeGate(): void {
    projections.clear();
    continuations.clear();
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
  function currentVerification(old: number, expected: number): boolean {
    return old === generation && expected === verification;
  }
  async function reload(): Promise<void> {
    unread.request();
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
      expected = verification,
      offline = localOnly || !navigator.onLine,
      page = offline ? null : await controller.list(cursor);
    if (!currentVerification(old, expected) || !container) return;
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
    if (!currentVerification(old, expected)) return;
    await copiesList(host);
    cursor = page ? page.next : null;
    if (cursor) moreButton(host, t('More conversations'), list);
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
            'No handle conversations yet. Open a public profile to send a message.',
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
    const expected = verification;
    try {
      const previews = await controller.directoryPreviews(peers);
      if (!currentVerification(old, expected)) return;
      paintDmDirectoryPreviews(host, previews);
    } catch (error: unknown) {
      if (currentVerification(old, expected))
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
      expected = verification,
      page = await controller.copies(after);
    if (!currentVerification(old, expected)) return;
    if (page.items.length && !after)
      host.append(communityElement('h4', t('On this device'), 'dm-list-title'));
    for (const row of page.items)
      host.append(
        directoryRow(
          { peer: row.peer, label: t('Local copy') },
          `&history=local`,
        ),
      );
    if (page.next)
      moreButton(host, t('More local copies'), () =>
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
  async function identity(
    id: string,
    work: VaultWorkOptions = {},
  ): Promise<PublicProfile> {
    // UUID is not a directory of private contacts. Only already-approved public identities are returned.
    const page = await controller.list(null, work);
    const known = page.items.find((row) => row.peer.id === id);
    if (known) return known.peer;
    return publicProfile(
      await controller.request('profile', { peer: id }, work),
    );
  }
  /** One frame per conversation: refreshes update it in place. */
  function frame(selected: string): DmView {
    const key = `${selected}:${localOnly}`;
    if (view && viewKey === key && container?.contains(view.panel)) return view;
    if (!container) throw new Error('DM ended.');
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
  async function loadConversation(
    selected: string,
    usable: () => boolean,
    work: VaultWorkOptions,
  ) {
    const offline = localOnly || !navigator.onLine;
    if (offline) {
      const page = await controller.cached(selected, before, work);
      return {
        offline,
        value: null,
        page,
        profile: page.items[0]?.peer ?? null,
      };
    }
    const value = await openDmConversation(controller, selected, usable, work);
    return {
      offline,
      value,
      page: null,
      profile: value?.peer ?? (await identity(selected, work)),
    };
  }
  async function conversation(): Promise<void> {
    const selected = peer;
    if (!selected || !container) return;
    const old = generation,
      expected = verification,
      work = dmConversationWork(),
      data = await loadConversation(
        selected,
        () => old === generation && expected === verification,
        work,
      );
    if (old !== generation || expected !== verification || !container) return;
    const current = frame(selected);
    current.gate.textContent = '';
    paintHeader(current, data);
    options(current, selected, data.profile, data.value);
    const gate = dmComposerGate({
      value: data.value,
      local: data.offline,
    });
    current.request.hidden = gate === null;
    current.request.textContent = gate ?? '';
    writable = !data.offline && gate === null;
    const page = await messages(current, selected, old, {
      cached: data.page,
      work,
    });
    projections.remember(
      { ...data, page },
      {
        current: currentVerification(old, expected),
        live: live.current,
        before,
      },
    );
  }
  function paintHeader(
    current: DmView,
    data: Pick<
      Awaited<ReturnType<typeof loadConversation>>,
      'profile' | 'value' | 'offline'
    >,
  ): void {
    if (!data.profile) {
      current.title.textContent = t('DM history on this device');
      return;
    }
    paintDmPeer(current, {
      profile: data.profile,
      state: dmStateLabel(data.value, data.offline),
      signal: externalAbort.signal,
    });
  }
  async function messages(
    current: DmView,
    selected: string,
    old: number,
    input: { cached: DmPage | null; work: VaultWorkOptions },
  ): Promise<DmPage | undefined> {
    const expected = verification,
      canWrite = writable;
    const page =
      input.cached ??
      (canWrite
        ? await controller.read(selected, before, input.work)
        : await controller.cached(selected, before, input.work));
    const draft = canWrite
      ? await controller.pending(selected, input.work)
      : null;
    const mediaPending = canWrite
      ? await controller.mediaDraft(selected, input.work)
      : false;
    if (old !== generation || expected !== verification) return;
    pendingMedia = mediaPending;
    if (draft) {
      messageId = draft.id;
      composer.restoreDraft(draft.text);
    }
    renderHistory(current, page, { selected, localMedia: !canWrite });
    current.history.hidden = false;
    composer.update(composerState());
    const usable = () =>
      old === generation &&
      expected === verification &&
      writable &&
      document.visibilityState === 'visible' &&
      current.history.isConnected &&
      current.history.getClientRects().length > 0;
    if (canWrite)
      await readVisibleDm({
        history: current.history,
        controller,
        peer: selected,
        page,
        work: input.work,
        usable,
        changed: () => unread.request(),
      });
    return page;
  }
  function options(
    current: DmView,
    selected: string,
    profile: PublicProfile | null,
    value: SocialRelation | null,
  ): void {
    current.options.replaceChildren();
    if (profile) {
      const link = communityElement('a', t('View public profile'));
      link.href = `#users?handle=${encodeURIComponent(profile.handle)}`;
      current.options.append(withMenuIcon(link, 'profile'));
    }
    if (localOnly || !navigator.onLine) return;
    const blocked = value?.blocked ?? false;
    optionButton(
      current,
      {
        label: blocked ? t('Unblock') : t('Block'),
        icon: blocked ? 'unblock' : 'block',
      },
      async () => {
        projections.clear();
        await controller.request('block', {
          peer: selected,
          blocked: !blocked,
          revision: value?.blockRevision ?? 0,
        });
        before = null;
        await conversation();
      },
    );
    optionButton(
      current,
      { label: t('Reload conversation'), icon: 'refresh' },
      async () => {
        before = null;
        await conversation();
      },
    );
  }
  function optionButton(
    current: DmView,
    item: { label: string; icon: MenuIconName },
    work: () => Promise<void>,
  ): void {
    const button = withMenuIcon(
      communityElement('button', item.label),
      item.icon,
    );
    button.type = 'button';
    button.addEventListener('click', () => {
      button.closest('details')?.removeAttribute('open');
      void run(work);
    });
    current.options.append(button);
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
    if (!page.items.length) current.gate.textContent = t('No messages yet.');
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
          'The saved copy is outside the vault and personal cleanup. Only open files from sources you trust.',
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
  function clearView(): void {
    workQueue.reset();
    continuations.clear();
    refreshes.clear();
    if (view) clearDmChecks(view.history);
    emojiPicker.reset();
    clearRows();
    composer.leave();
    playback.close();
    generation++;
    container = null;
    view = null;
    viewKey = '';
    writable = false;
    pendingMedia = false;
    messageId = crypto.randomUUID();
  }
  function leave(): void {
    clearView();
    if (!publicDirectory.available) {
      projections.clear();
      stopLifecycle?.();
      stopLifecycle = null;
      streamCurrent = false;
      live.stop();
      if (fallback) clearInterval(fallback);
      fallback = null;
    }
  }
  return {
    ready: () => unread.start(),
    event(signal: LiveEvent): void {
      const event = scopedLiveEvent(signal, [
        'handle-messages',
        'handle-receipts',
      ]);
      if (!event) return;
      if (event === 'call') return;
      if (['authorization', 'revoked', 'ended', 'invalidated'].includes(event))
        unread.invalidate();
      unread.request();
    },
    mount(node: HTMLElement, id: string | null, local = false): void {
      clearView();
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
            t('Sign in through Profile to open your handle messages.'),
            'chat-gate',
          ),
        );
        return;
      }
      const restored = id
        ? projections.get(id, live.current && navigator.onLine && !localOnly)
        : null;
      if (restored && id) {
        const current = frame(id);
        paintHeader(current, restored);
        options(current, id, restored.profile, restored.value);
        renderHistory(current, restored.page, {
          selected: id,
          localMedia: false,
        });
        current.history.hidden = false;
        writable = true;
        composer.update(composerState());
      } else
        status(id ? t('Opening conversation…') : t('Loading handle messages…'));
      const old = generation;
      void run(async () => {
        const profile =
          navigator.onLine && !localOnly
            ? (ownProfile ??
              (await controller.initialize(id ? dmConversationWork() : {})))
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
      projections.clear();
      leave();
      session = value;
      ownProfile = null;
      controller.setSession(value);
      unread.reset(value !== null);
      node?.replaceChildren();
    },
    canActivate: () => !busy && !composer.active,
    /** Public identity only, independently live in the contact directory. */
    async directory(node: HTMLElement, valid: () => boolean): Promise<void> {
      if (!session) {
        node.replaceChildren(
          communityElement(
            'p',
            t('Sign in with your wallet to view your handle messages.'),
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
