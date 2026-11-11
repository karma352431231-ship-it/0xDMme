import { decodeGroupText } from '../../shared/group-messages/index.ts';
import type { DailyText } from '../../shared/daily/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import type { GroupController } from './controller.ts';
import type { GroupView } from './reader.ts';
import { groupMessageActions } from './message-actions.ts';
import type { GroupMessageActions } from './message-actions.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import { GroupComposer } from './composer.ts';
import { groupMessageView } from './message-content.ts';
import type { GroupMessageView } from './message-content.ts';
import { HistoryReactions } from '../message-actions/index.ts';
import { renderViewOnce } from '../view-once-ui/index.ts';
import {
  openMessageMenu,
  reopenMessageMenu,
  closeMessageMenu,
} from '../message-menu/index.ts';
import { MessageDeletionSelection } from '../message-selection/index.ts';
import { MessageForwardSelection } from '../message-forward/index.ts';
import type { ForwardDirectory } from '../message-forward/index.ts';
import type { DailyView } from '../daily-text/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import { AttachmentUi } from '../attachment-ui/index.ts';
import { placeVideoMessageMeta } from '../chat-video/index.ts';
import { emojiText } from '../emoji/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { ExternalTextHistory } from '../external-media/index.ts';
import { showExternalVideos } from '../external-video/index.ts';
import { showGifText, gifUrls } from '../gif-search/index.ts';
import { checksIcon, messageChecks } from '../message-status/index.ts';
import {
  dayHeading,
  messageDay,
  messageTime,
  withDayHeadings,
} from '../message-presentation/index.ts';

import { GroupOutgoing } from './outgoing.ts';
import type { PendingGroupText } from './outgoing.ts';
import { GroupDeliveryTrace } from './delivery-trace.ts';
import type { GroupMemberPresentation } from './member-presentation.ts';
import { memberContactTrigger } from './member-contact.ts';

import {
  historyPosition,
  watchHistoryPosition,
  resetHistoryPosition,
  watchOlderHistory,
} from '../chat-ui/index.ts';
import type { OlderHistory } from '../chat-ui/index.ts';
interface ChatOptions {
  controller: Pick<
    GroupController,
    | 'selected'
    | 'historyPending'
    | 'views'
    | 'olderAvailable'
    | 'media'
    | 'edit'
    | 'removeMessage'
    | 'compose'
    | 'sendPending'
    | 'composeText'
    | 'sendGroupDrafts'
    | 'react'
    | 'stageMedia'
    | 'draftMedia'
    | 'openViewOnce'
    | 'searchFocused'
  >;
  account: () => string | undefined;
  playback: VoicePlayback;
  externalMedia?: ExternalMediaConsent | undefined;
  isBusy: () => boolean;
  members: Pick<
    GroupMemberPresentation,
    'name' | 'label' | 'sender' | 'contactCandidate' | 'offerContact'
  >;
  visibleGroup: () => string | null;
  reconcile: (group: string) => Promise<void>;
  operationRun: (work: () => Promise<void>) => Promise<void>;
  run: (work: () => Promise<void>) => Promise<void>;
  reopen: (older?: boolean) => Promise<void>;
  select: () => void;
  report: (notice: string) => void;
  status: () => void;
  peers?: () => readonly Peer[];
  forwarding?: ForwardDirectory;
  forward?: (view: DailyView<GroupMessageView>, peer: string) => Promise<void>;
  flushForward?: () => Promise<void>;
}
/** Owns the mounted conversation's bubbles, composer and media resources.
 * Persistence, verified reads and group authority stay in the controller. */
export class GroupChatView {
  private readonly options: ChatOptions;
  private readonly outgoing = new GroupOutgoing();
  private readonly delivery = new GroupDeliveryTrace();
  private readonly composer: GroupComposer;
  private readonly reactions: HistoryReactions<GroupMessageView>;
  private readonly deletion: MessageDeletionSelection;
  private readonly forwarding: MessageForwardSelection<GroupMessageView> | null;
  private host: HTMLElement | null = null;
  private readonly attachments: Pick<AttachmentUi, 'render'>;
  private readonly messageActions: GroupMessageActions;
  private readonly externalRows = new ExternalTextHistory();
  private externalAbort = new AbortController();
  private older: { stop: AbortController; watch: OlderHistory } | null = null;
  constructor(options: ChatOptions) {
    this.options = options;
    this.composer = new GroupComposer({
      controller: options.controller,
      playback: options.playback,
      externalMedia: options.externalMedia,
      account: options.account,
      isBusy: options.isBusy,
      run: options.run,
      operationRun: options.operationRun,
      reopen: () => options.reopen(),
      report: options.report,
      changed: () => {
        this.renderHistory();
        options.status();
      },
      progress: {
        sending: (id) => this.delivery.step('sending', id),
        accepted: (id) => {
          this.delivery.step('accepted', id);
          const open = options.visibleGroup();
          this.outgoing.accepted(id, performance.now(), open);
          if (open && this.outgoing.crowded(open))
            options
              .reconcile(open)
              .catch((error: unknown) => this.reportGroupError(error));
        },
      },
      draftChanged: (draft, phase) => {
        this.outgoing.update(draft, phase);
        if (phase !== 'save-failed')
          this.delivery.step(
            phase === 'admitted' ? 'admitted' : 'staged',
            draft.id,
          );
        this.renderHistory();
      },
    });
    this.attachments = this.composer.media;
    this.deletion = new MessageDeletionSelection(options.run, { group: true });
    this.reactions = new HistoryReactions<GroupMessageView>({
      action: (label, work) => this.button(label, work),
      send: async (view, emoji, id) => {
        await options.controller.react(view, emoji, id);
        await options.reopen();
      },
    });
    this.forwarding =
      options.forwarding && options.forward
        ? new MessageForwardSelection({
            history: () => this.node('[data-group-history]'),
            views: () =>
              options.controller.views
                .map(groupMessageView)
                .filter((v) => !v.content.viewOnce),
            signal: () => this.externalAbort.signal,
            directory: options.forwarding,
            run: options.run,
            stage: options.forward,
            flush: options.flushForward ?? (() => Promise.resolve()),
          })
        : null;
    this.messageActions = {
      run: options.run,
      choose: (mode, view) => this.composer.choose(mode, view),
      picker: this.composer.picker,
      peers: options.peers ?? (() => []),
      forwardAllowed: () => !!options.forwarding?.contacts().length,
      writable: () =>
        !!options.controller.selected && !options.controller.selected.localOnly,
      forward: (view) => {
        this.deletion.clear();
        this.forwarding?.start(groupMessageView(view));
      },
      react: (view, emoji) =>
        this.reactions.change(groupMessageView(view), emoji),
      remove: async (view) => {
        if (matchMedia('(max-width: 700px)').matches) {
          this.forwarding?.clear();
          this.deletion.begin(view.id);
          return;
        }
        const pending = options.controller.removeMessage(view);
        this.renderHistory();
        try {
          await pending;
          await options.reopen();
        } finally {
          this.renderHistory();
        }
      },
    };
  }

  status(): void {
    this.composer.status();
  }
  get recording(): boolean {
    return this.composer.recording;
  }
  canActivate(): boolean {
    return this.composer.canActivate();
  }
  closeActions(): void {
    closeMessageMenu(this.node('[data-group-history]'));
    this.deletion.clear();
    this.forwarding?.clear();
  }
  pauseActions(): void {
    closeMessageMenu(this.node('[data-group-history]'));
  }
  open(id: string): void {
    closeMessageMenu(this.node('[data-group-history]'));
    if (this.recording)
      throw new Error(
        'Send or remove the voice preview before changing conversations.',
      );
    if (this.options.controller.selected?.state.groupId !== id)
      resetHistoryPosition(this.node('[data-group-history]'));
    this.options.select();
    this.composer.deselect();
    if (this.host) this.host.hidden = false;
  }
  deselect(): void {
    this.invalidateHistory();
    this.composer.deselect();
    if (this.host) this.host.hidden = true;
  }
  invalidateHistory(): void {
    this.externalRows.clear();
    this.externalAbort.abort();
    this.externalAbort = new AbortController();
  }
  clearSession(): void {
    this.composer.reset();
    this.closeActions();
  }
  leave(): void {
    this.invalidateHistory();
    this.closeActions();
    this.composer.leave();
  }
  suspend(revoked: boolean): void {
    this.composer.suspend(revoked);
    this.renderHistory();
  }
  bindBrowserLifetime(): void {
    this.composer.bindBrowserLifetime();
  }
  mount(container: HTMLElement): void {
    this.host = container;
    this.composer.mount(container);
    this.watchOlder();
  }
  /** Scrolling to the top of the history reads one page further back. */
  private watchOlder(): void {
    this.older?.stop.abort();
    const history = this.node('[data-group-history]');
    if (!history) return;
    const stop = new AbortController(),
      controller = this.options.controller;
    this.older = {
      stop,
      watch: watchOlderHistory({
        history,
        button: this.node<HTMLButtonElement>('[data-group-older]'),
        available: () =>
          !controller.historyPending &&
          !controller.searchFocused &&
          controller.olderAvailable,
        load: async () => {
          const group = controller.selected?.state.groupId,
            shown = controller.views.length;
          await this.options.run(() => this.options.reopen(true));
          return (
            controller.selected?.state.groupId === group &&
            controller.views.length > shown
          );
        },
        signal: stop.signal,
      }),
    };
  }
  private node<T extends HTMLElement>(selector: string): T | null {
    return this.host?.querySelector<T>(selector) ?? null;
  }
  renderHistory(): void {
    const history = this.node('[data-group-history]');
    if (!history) return;
    watchHistoryPosition(history, this.externalAbort.signal);
    if (this.options.controller.historyPending) {
      historyPosition(history);
      history.hidden = true;
      closeMessageMenu(this.node('[data-group-history]'));
      this.forwarding?.clear();
      this.deletion.clear();
      this.reactions.closeGate();
      return;
    }
    this.composer.reconcileContext();
    const restoreScroll = historyPosition(
      history,
      this.options.controller.views,
    );
    history.hidden = false;
    const rows = this.options.controller.views.map((view, index, views) => ({
      id: view.id,
      sentAt: view.sentAt,
      key: JSON.stringify([
        view.text,
        view.hash,
        view.sender,
        this.options.members.name(view.sender),
        this.options.members.label(view.sender).wallet ?? '',
        this.startsRun(views, index),
        view.localOnly,
        view.kind,
        view.unavailableMedia,
        view.edited,
        view.sentAt,
      ]),
      render: (signal: AbortSignal) =>
        this.renderView(view, signal, this.startsRun(views, index)),
    }));
    const menu = openMessageMenu(history);
    this.externalRows.render(
      history,
      [
        ...withDayHeadings(
          rows,
          (row) => row.sentAt,
          (day) => ({
            id: `day:${day.key}`,
            sentAt: undefined,
            key: `day:${day.label}`,
            render: () => dayHeading(day.label),
          }),
        ),
        ...this.pendingRows(),
        ...this.composer.pendingRows(
          new Set(this.options.controller.views.map((v) => v.id)),
        ),
      ],
      this.externalAbort.signal,
    );
    this.delivery.rendered(
      this.options.controller.selected?.state.groupId ?? null,
      this.options.controller.views,
    );
    for (const view of this.options.controller.views) {
      const row = history.querySelector<HTMLElement>(
        `[data-group-message="${view.id}"]`,
      );
      if (row) this.renderDelivery(row, view);
    }
    this.reactions.reconcile(
      this.options.controller.views.map(groupMessageView),
      [],
    );
    this.forwarding?.update();
    this.deletion.update(
      history,
      this.options.controller.views
        .filter((v) => v.own && !v.localOnly)
        .flatMap((view) => {
          const row = [
            ...history.querySelectorAll<HTMLElement>('[data-group-message]'),
          ].find((r) => r.dataset['groupMessage'] === view.id);
          return row
            ? [
                {
                  id: view.id,
                  row,
                  remove: async () => {
                    await this.options.controller.removeMessage(view);
                    await this.options.reopen();
                  },
                },
              ]
            : [];
        }),
    );
    this.composer.observed(history, this.options.controller.views);
    reopenMessageMenu(history, menu);
    restoreScroll();
    this.older?.watch.check();
  }
  private renderView(
    view: GroupView,
    mediaSignal: AbortSignal,
    first: boolean,
  ): HTMLElement {
    const article = document.createElement('article');
    article.className = view.own
      ? 'chat-message own'
      : 'chat-message group-incoming';
    article.dataset['groupMessage'] = view.id;
    article.dataset['message'] = view.id;
    const content = groupMessageView(view).content;
    const reactionPanel = this.reactions.mount(
      groupMessageView(view),
      mediaSignal,
    );
    this.appendAuthor(article, view, first);
    if (content.viewOnce) {
      renderViewOnce({
        host: article,
        id: view.id,
        own: view.own,
        metadata: content.viewOnce,
        signal: mediaSignal,
        current: () => article.isConnected && !mediaSignal.aborted,
        open: (diagnostic, media) =>
          this.options.controller.openViewOnce(
            view,
            content.viewOnce!,
            mediaSignal,
            { diagnostic, media },
          ),
      });
    } else if (view.kind === 'attachment') {
      this.attachments.render({
        article,
        imageOverlay: reactionPanel,
        caption: content.text,
        view: { id: view.id, text: view.text, peer: view.sender },
        signal: mediaSignal,
        load: (_media, thumbnail) =>
          this.options.controller.media(view, thumbnail),
        run: this.options.run,
      });
      if (view.unavailableMedia.length) {
        const unavailable = document.createElement('p');
        unavailable.textContent = t(
          'Media unavailable in the remote vault. A downloaded copy may remain on this device.',
        );
        article.append(unavailable);
      }
    } else {
      const text = document.createElement('p');
      emojiText(text, content.text);
      this.renderExternal(article, text, content.text, mediaSignal);
      article.append(text);
    }
    this.appendAnnotations(article, content);
    this.renderDelivery(article, view);
    if (view.localOnly) {
      const local = document.createElement('small');
      local.textContent = t(
        'Local copy · content unavailable in the remote vault',
      );
      article.append(local);
    }
    article.append(
      groupMessageActions({
        view,
        signal: mediaSignal,
        row: article,
        actions: this.messageActions,
      }),
    );
    if (!reactionPanel.parentNode) article.append(reactionPanel);
    return article;
  }
  private appendAnnotations(article: HTMLElement, content: DailyText): void {
    if (content.reply) {
      const quote = document.createElement('small');
      quote.className = 'chat-reply-quote';
      const original = this.options.controller.views.find(
        (v) => v.id === content.reply,
      );
      quote.textContent = original
        ? t('Replying to: {0}', [
            this.options.members.name(original.sender) +
              ' · ' +
              groupMessageView(original).content.text.slice(0, 120),
          ])
        : t('Reply: original message is outside this page or unavailable.');
      article.prepend(quote);
    }
    if (content.forwarded) {
      const label = document.createElement('small');
      label.textContent = t('Forwarded');
      article.append(label);
    }
  }
  private renderDelivery(article: HTMLElement, view: GroupView): void {
    article.querySelector('.message-meta')?.remove();
    const parts = metaParts(view);
    if (!parts.length) return;
    const state = document.createElement('small');
    state.className = 'message-meta';
    state.append(...parts);
    placeVideoMessageMeta(article, state);
  }
  private renderExternal(
    article: HTMLElement,
    text: HTMLElement,
    value: string,
    mediaSignal: AbortSignal,
  ): void {
    if (!this.options.externalMedia) return;
    const settings = {
      privacy: this.options.externalMedia,
      signal: mediaSignal,
    };
    const gif = gifUrls(value).length;
    if (gif) {
      text.replaceChildren();
      showGifText(text, value, { ...settings, renderText: emojiText });
    }
    showExternalVideos(article, value, settings);
  }

  private pendingRows() {
    const group = this.options.controller.selected;
    if (!group) return [];
    return this.outgoing
      .rows(
        group.state.groupId,
        new Set(this.options.controller.views.map((v) => v.id)),
      )
      .map((text) => ({
        id: `pending:${text.id}`,
        key: JSON.stringify(['pending', text.text, text.failed]),
        render: () => this.renderPendingText(text),
      }));
  }
  private renderPendingText(text: PendingGroupText): HTMLElement {
    const article = document.createElement('article');
    article.className = 'chat-message own';
    article.dataset['groupPending'] = text.id;
    const sender = document.createElement('strong');
    sender.textContent = t('You');
    const body = document.createElement('p');
    emojiText(body, decodeGroupText(text.text).text);
    const state = document.createElement('small');
    state.className = 'message-meta';
    if (text.failed) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'message-send-failed';
      retry.textContent = '✕';
      retry.title = t('chat.save-failed');
      retry.setAttribute(
        'aria-label',
        t('{0}. {1}', [t('chat.save-failed'), t('chat.retry-save')]),
      );
      retry.addEventListener('click', () => this.composer.retryTexts());
      state.append(retry);
    } else
      state.append(
        checksIcon(
          messageChecks({ own: true, delivery: 'accepted', read: false })!,
        ),
      );
    this.appendAnnotations(article, decodeGroupText(text.text));
    article.append(sender, body, state);
    return article;
  }
  /** A new author, or a new day heading, shows the author again. */
  private startsRun(views: readonly GroupView[], index: number): boolean {
    const previous = views[index - 1],
      view = views[index];
    return (
      !previous ||
      previous.sender !== view?.sender ||
      dayOf(previous) !== dayOf(view)
    );
  }
  private appendAuthor(
    article: HTMLElement,
    view: GroupView,
    first: boolean,
  ): void {
    if (view.own) {
      const sender = document.createElement('strong');
      sender.textContent = this.options.members.name(view.sender);
      article.append(sender);
      return;
    }
    if (!first) return;
    article.classList.add('group-run-start');
    const [avatar, author] = this.options.members.sender(view.sender);
    if (!avatar || !author) return;
    if (this.options.members.contactCandidate(view.sender))
      memberContactTrigger(
        author,
        this.options.members.name(view.sender),
        () => {
          void this.options.run(() =>
            this.options.members.offerContact(view.sender),
          );
        },
      );
    article.append(avatar, author);
  }
  settleOutgoing(id: string, started: number): void {
    const selected = this.options.controller.selected;
    if (
      selected?.state.groupId !== id ||
      selected.localOnly ||
      this.options.controller.historyPending ||
      this.options.controller.searchFocused
    )
      return;
    const { settled, retired } = this.outgoing.verified(
      id,
      new Set(this.options.controller.views.map((view) => view.id)),
      started,
    );
    for (const message of settled) this.delivery.step('settled', message);
    for (const message of retired) this.delivery.step('retired', message);
    if (retired.length) this.renderHistory();
  }
  private reportGroupError(error: unknown): void {
    this.options.report(
      error instanceof Error
        ? translatedError(error.message)
        : t('Could not complete the group operation.'),
    );
    this.options.status();
  }
  resetTexts(): void {
    this.composer.reset();
    this.outgoing.clear();
  }
  private button(label: string, work: () => Promise<void>): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      void this.options.run(work);
    });
    return button;
  }
  hint(): void {
    this.delivery.hint();
  }
}

function dayOf(view: GroupView | undefined): string | null {
  return view?.sentAt === undefined ? null : messageDay(view.sentAt).key;
}

/** Time, edit mark and checks, in the order private messages show them. */
function metaParts(view: GroupView): (Node | string)[] {
  const checks = messageChecks({
      own: view.own,
      ...(view.delivery ? { delivery: view.delivery } : {}),
      read: view.read ?? false,
    }),
    time = messageTime(view.sentAt),
    parts: (Node | string)[] = [];
  if (time) parts.push(time);
  if (view.edited) parts.push(t('Edited · '));
  if (checks)
    parts.push(
      checksIcon({
        ...checks,
        label: view.read
          ? t('Seen by recipients who share read receipts')
          : checks.label,
      }),
    );
  return parts;
}
