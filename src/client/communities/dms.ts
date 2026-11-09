import { DmSearch } from './dm-search.ts';
import { navigateApp } from '../app-navigation/index.ts';
import { revealMessage, renderSearchReturn } from '../chat-ui/index.ts';
import { DmControls } from './dm-controls.ts';
import { dmFailure } from './dm-failures.ts';
import { measureWork } from '../synchronization-diagnostics/index.ts';
import { DmProjections } from './dm-projections.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { clearDmChecks, refreshDmChecks } from './dm-checks.ts';
import { readVisibleDm } from './dm-read.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { publicProfile } from '../../shared/public-profile/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import { VoicePlayback } from '../voice-playback/index.ts';
import { scopedLiveEvent } from '../message-live/index.ts';
import { SocialDms } from '../social-dm/index.ts';
import type {
  VaultAccess,
  VaultWorkOptions,
} from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { resetHistoryPosition } from '../chat-ui/index.ts';
import { communityElement } from './elements.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import {
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
import {
  DmDirectory,
  dmDirectoryRow as directoryRow,
  paintDmDirectoryPreviews,
} from './dm-directory.ts';
import { createDmInbox } from './dm-inbox.ts';
import type { LiveEvent } from '../message-live/index.ts';
import { withMenuIcon } from '../menu-icons/index.ts';
import type { MenuIconName } from '../menu-icons/index.ts';

import { publicProfileCreatedEvent } from '../profile-shortcut/index.ts';
import { DmHistory } from './dm-history.ts';
import { DmHistoryDepth } from './dm-window.ts';
import { DmRefresh } from './dm-refresh.ts';
import { DmSending } from './dm-sending.ts';
import { DmTextSending } from './dm-text-sending.ts';
import { encodeDailyText } from '../../shared/daily/index.ts';
import type { DmPage, DmItem } from './dm-history.ts';

export function startSocialDmUi(
  access: VaultAccess,
  sync: VaultSync,
  privacy: ExternalMediaConsent,
  controlsOptions: {
    unreadChanged?: (count: number) => void;
    blockPublic?: (peer: string) => Promise<void>;
  } = {},
) {
  const controller = new SocialDms(access, sync);
  let pendingReveal: { peer: string; id: string; sequence: number } | null =
    null;
  const search = new DmSearch(controller, (selected, target) => {
    if (target) pendingReveal = { peer: selected, ...target };
    if (container && peer === selected) {
      depth.focus(selected, target?.sequence ?? null);
      void run(conversation);
      return;
    }
    navigateApp(`#communities?view=dms&dm=${selected}`);
  });
  const controls = new DmControls({
    access,
    sync,
    run,
    block: async (peer, blocked, revision) => {
      await controller.request('block', { peer, blocked, revision });
    },
    state: (peer) => controller.state(peer),
    changed: async () => {
      projections.clear();
      await reload();
    },
    ...(controlsOptions.blockPublic
      ? { blockPublic: controlsOptions.blockPublic }
      : {}),
  });
  const unread = createDmInbox(
    controller,
    controlsOptions.unreadChanged ?? (() => {}),
    (peers) => controls.audible(peers),
  );
  const publicDirectory = new DmDirectory({
    list: async (after) => {
      if (!navigator.onLine || after?.startsWith('local:')) {
        const page = await controller.copies(
          after?.slice('local:'.length) || null,
        );
        return {
          items: page.items.map((item) => ({
            peer: item.peer,
            label: t('Local copy'),
            local: true as const,
          })),
          next: page.next ? 'local:' + page.next : null,
        };
      }
      const page = await controller.list(after);
      await controls.load(page.items.map((row) => row.peer.id));
      return page;
    },
    actions: (relation) => controls.actions(relation),
    previews: (peers) => controller.directoryPreviews(peers),
  });
  const playback = new VoicePlayback();
  const history = new DmHistory({
    playback,
    privacy,
    controller,
    run,
    react,
    edit: (item) => composer.edit(item),
    reply: (item) => composer.reply(item),
    outgoing: (selected) => texts.forPeer(selected),
    retryOutgoing: () => texts.retry(),
    remove: async (item) => {
      const selected = peer;
      if (!selected || !writable || !item.own)
        throw new Error('Own message unavailable.');
      await controller.remove(selected, item);
      projections.clear();
      await conversation();
    },
  });
  const sending = new DmSending(controller);
  const texts = new DmTextSending({
    controller,
    available: () =>
      Boolean(session) &&
      navigator.onLine &&
      document.visibilityState === 'visible',
    changed: () => {
      drawOutgoing();
      composer.update(composerState());
      refreshes.resume();
    },
    failed: (error) => {
      if (dmFailure(error, { sameSession: true, current: true }) === 'deny') {
        closeGate();
        refreshes.requestContinuation();
      }
      status(
        error instanceof Error
          ? translatedError(error.message)
          : t('DM unavailable.'),
      );
    },
  });
  const composer = startDmComposer({
    playback,
    privacy,
    run,
    queueText: (text, reply) => {
      if (!peer || !writable || localOnly) throw new Error('DM unavailable.');
      texts.enqueue(
        peer,
        reply ? encodeDailyText({ text, reply, forwarded: false }) : text,
      );
    },
    queueFull: () => texts.full,
    changed: () => refreshes.resumeRefresh(),
    submit: async ({ text, media, pending }) => {
      const selected = peer;
      if (!selected) return;
      await sending.send(selected, {
        text,
        media,
        pending,
        editing: composer.editing,
        replying: composer.replying,
      });
      if (selected !== peer) return;
      await conversation();
    },
    discardPending: async () => {
      if (peer) await controller.cancelMedia(peer);
    },
  });
  const projections = new DmProjections();
  const workQueue = new DmWork();
  const refreshes = new DmRefresh({
    access,
    state: () => ({
      signedIn: !!session,
      mounted: !!container,
      directory: publicDirectory.available,
      busy: busy || texts.transmitting,
      composing: composer.active,
    }),
    reload: () => {
      void run(reload);
    },
    invalidate: () => {
      publicDirectory.invalidate();
      closeGate();
    },
    forget: () => projections.clear(),
    receipts: () => {
      void run(refreshReceipts);
    },
    clearDirectory: () => publicDirectory.clear(),
  });
  let container: HTMLElement | null = null,
    session: AccountSession | null = null,
    view: DmView | null = null,
    viewKey = '';
  let generation = 0,
    verification = 0,
    busy = false,
    peer: string | null = null,
    cursor: string | null = null;
  const depth = new DmHistoryDepth();
  let displayedPage: DmPage | null = null;
  let ownProfile: string | null = null;
  let localOnly = false;
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
        refreshes.clearContinuation();
      } catch (error: unknown) {
        const failure = dmFailure(error, {
          sameSession: sameSession(account, session),
          current: old === generation && expected === verification,
        });
        if (failure === 'continue') refreshes.requestContinuation();
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
        texts.resume();
        refreshes.resume();
      }
    });
  }
  function closeGate(): void {
    projections.clear();
    refreshes.clearContinuation();
    verification++;
    controller.cancel();
    writable = false;
    history.clear();
    displayedPage = null;
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
  function focusSearchResult(id: string | null): void {
    depth.clearFocus();
    if (id && pendingReveal?.peer === id)
      depth.focus(id, pendingReveal.sequence);
  }
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
    history.clear();
    view = dmConversationView(container);
    viewKey = key;
    resetHistoryPosition(view.history);
    composer.bind(view, selected);
    depth.bind({
      history: view.history,
      button: view.older,
      conversation: () => peer,
      shown: () => history.shown,
      load: () => run(conversation),
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
      const page = await controller.cached(
        selected,
        depth.before(selected),
        work,
      );
      return {
        offline,
        value: null,
        page,
        profile: page.items[0]?.peer ?? null,
      };
    }
    const value = await openDmConversation(controller, selected, usable, work);
    await controls.load([selected]);
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
        live: refreshes.current,
      },
    );
    renderSearchReturn(current.history, {
      active: () => depth.before(selected) !== null,
      latest: () => {
        depth.focus(selected, null);
        void run(conversation);
      },
    });
    if (pendingReveal?.peer === selected) {
      const target = pendingReveal;
      pendingReveal = null;
      await revealMessage(target.id, {
        row: (id) =>
          [
            ...current.history.querySelectorAll<HTMLElement>(
              'article[data-message]',
            ),
          ].find((row) => row.dataset['message'] === id) ?? null,
        older: { available: () => false, load: () => Promise.resolve(false) },
        valid: () => peer === selected && currentVerification(old, expected),
      });
    }
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
      signal: history.signal,
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
    const page = await depth.window(
      selected,
      input.cached ??
        (canWrite
          ? await controller.read(selected, null, input.work)
          : await controller.cached(selected, null, input.work)),
      (before) => controller.cached(selected, before, input.work),
    );
    const mediaPending = canWrite
      ? await controller.mediaDraft(selected, input.work)
      : false;
    if (old !== generation || expected !== verification) return;
    pendingMedia = mediaPending;
    if (canWrite) await texts.restore(selected);
    if (old !== generation || expected !== verification) return;
    displayedPage = page;
    texts.observed(page.items);
    history.render(current, page, {
      selected,
      localMedia: !canWrite,
    });
    current.history.hidden = false;
    depth.check();
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
  function drawOutgoing(): void {
    if (!view || !peer || !writable || !displayedPage) return;
    history.render(view, displayedPage, {
      selected: peer,
      localMedia: false,
    });
  }
  async function refreshReceipts(): Promise<void> {
    if (!view || !peer || !writable || !displayedPage) return;
    const current = view,
      selected = peer,
      old = generation,
      expected = verification;
    await refreshDmChecks({
      history: current.history,
      controller,
      peer: selected,
      items: displayedPage.items,
      work: dmConversationWork(),
      usable: () =>
        currentVerification(old, expected) &&
        view === current &&
        peer === selected &&
        writable,
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
      const link = communityElement('a', t('View public profile'));
      link.href = `#users?handle=${encodeURIComponent(profile.handle)}`;
      current.options.append(withMenuIcon(link, 'profile'));
    }
    if (localOnly || !navigator.onLine) return;
    if (value)
      for (const action of controls.actions(value)) {
        const button = communityElement('button', action.label);
        button.type = 'button';
        button.dataset['conversationAction'] = action.id;
        button.addEventListener('click', () => {
          button.closest('details')?.removeAttribute('open');
          action.perform();
        });
        current.options.append(
          action.icon ? withMenuIcon(button, action.icon) : button,
        );
      }
    optionButton(
      current,
      { label: t('Reload conversation'), icon: 'refresh' },
      async () => {
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
  async function react(item: DmItem, emoji: string): Promise<void> {
    const target = peer;
    if (!target || !writable) return;
    await controller.react(target, item, emoji);
    await conversation();
  }
  function clearView(): void {
    workQueue.reset();
    refreshes.clear();
    if (view) clearDmChecks(view.history);
    history.reset();
    displayedPage = null;
    composer.leave();
    playback.close();
    generation++;
    container = null;
    view = null;
    viewKey = '';
    writable = false;
    pendingMedia = false;
    sending.reset();
  }
  function leave(): void {
    clearView();
    refreshes.leave();
  }
  // Once per session, and again when a public profile is created, so others
  // can write to it before its owner ever opens handle messages.
  let devicesChecked: AccountSession | null = null,
    watchingCreation = false,
    textsReady = false;
  function publishDevices(): void {
    if (!session || !navigator.onLine || devicesChecked === session) return;
    devicesChecked = session;
    controller.publishDevices().catch(() => {
      // Not retried in this session: a profile-less account would only fail
      // again. Opening handle messages publishes them and reports any error.
    });
  }
  function watchProfileCreation(): void {
    if (watchingCreation) return;
    watchingCreation = true;
    window.addEventListener(publicProfileCreatedEvent, () => {
      devicesChecked = null;
      publishDevices();
    });
  }
  return {
    search: (query: string, after: string | null) => search.page(query, after),
    ready: () => {
      unread.start();
      watchProfileCreation();
      publishDevices();
      if (session && !textsReady) {
        textsReady = true;
        texts.retry();
      }
    },
    event(signal: LiveEvent): void {
      const event = scopedLiveEvent(signal, [
        'handle-messages',
        'handle-receipts',
      ]);
      if (!event) return;
      if (event === 'call' || signal === 'handle-receipts') return;
      if (['authorization', 'revoked', 'ended', 'invalidated'].includes(event))
        unread.invalidate();
      unread.request();
    },
    mount(node: HTMLElement, id: string | null, local = false): void {
      clearView();
      container = node;
      peer = id;
      focusSearchResult(id);
      localOnly = local;
      if (!localOnly) refreshes.watch();
      cursor = null;
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
        ? projections.get(
            id,
            refreshes.current && navigator.onLine && !localOnly,
          )
        : null;
      if (restored && id) {
        const current = frame(id);
        paintHeader(current, restored);
        options(current, id, restored.profile, restored.value);
        displayedPage = restored.page;
        history.render(current, restored.page, {
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
        if (navigator.onLine && !localOnly) refreshes.connect();
        await reload();
      });
    },
    leave,
    setSession(value: AccountSession | null): void {
      if (sameSession(value, session)) return;
      const node = container;
      publicDirectory.clear();
      projections.clear();
      depth.clear();
      leave();
      composer.forgetDrafts();
      texts.reset();
      textsReady = false;
      session = value;
      ownProfile = null;
      pendingReveal = null;
      controller.setSession(value);
      controls.setSession(value);
      unread.reset(value !== null);
      node?.replaceChildren();
    },
    canActivate: () =>
      !busy &&
      !texts.pending &&
      !texts.unsaved &&
      !composer.active &&
      !composer.unsent,
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
      refreshes.watchDirectory();
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
