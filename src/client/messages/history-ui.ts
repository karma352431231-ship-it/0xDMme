import { MessageForwardSelection } from './forward-selection.ts';
import type { ForwardDirectory } from '../message-forward/index.ts';
import {
  messageTime,
  messageReactions,
} from '../message-presentation/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { messageStates, messageStateText } from '../message-state/index.ts';
import { historyPosition, updateMessageStates } from '../chat-ui/index.ts';
import { displayName, paintAvatar } from '../appearance/index.ts';
import type { HistoryUpdate } from '../message-visibility/index.ts';
import { dailyViews } from '../daily-text/index.ts';
import type { DailyView } from '../daily-text/index.ts';
import { messageActions } from '../message-actions/index.ts';
import { checksIcon, messageChecks } from '../message-status/index.ts';
import { gifUrls, showGifText } from '../gif-search/index.ts';
import { showExternalVideos } from '../external-video/index.ts';
import { ExternalTextHistory } from '../external-media/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { emojiText } from '../emoji/index.ts';
import type { AttachmentUi } from '../attachment-ui/index.ts';
import type { Daily } from '../daily/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { ConversationPeer } from './directory-controller.ts';
import type { startRepresentatives } from '../representatives/index.ts';
import { receivedState } from './controller.ts';
import type { Messages, MessageView } from './controller.ts';

type Actions = Parameters<typeof messageActions<MessageView>>[0];
interface HistoryPresentation {
  node: <T extends HTMLElement>(selector: string) => T | null;
  context: () => {
    selected: ConversationPeer | null;
    peers: readonly ConversationPeer[];
    session: AccountSession | null;
    calls: boolean;
  };
  visible: () => boolean;
  signal: () => AbortSignal;
  attachments: Pick<AttachmentUi, 'clearMedia' | 'render'>;
  media: Messages['media'];
  run: (work: () => Promise<void>) => Promise<void>;
  composerChanged: () => void;
  externalMedia?: ExternalMediaConsent;
  representatives?: Pick<ReturnType<typeof startRepresentatives>, 'renderCard'>;
  forwarding?: ForwardDirectory;
  flush?: () => Promise<void>;
  /** Covers the header initials with the contact's private card photo. */
  peerPhoto?: (host: HTMLElement, peer: string, signal: AbortSignal) => void;
  actions: Pick<Actions, 'action' | 'picker' | 'choose' | 'react'> & {
    forward: (view: DailyView<MessageView>, peer: string) => Promise<void>;
    remove: (view: MessageView) => Promise<void>;
  };
}

/** Consumes only verified windows. Never opens storage or bypasses the gate. */
export class MessageHistoryUi {
  private readonly options: HistoryPresentation;
  private readonly externalRows = new ExternalTextHistory();
  private readonly forwarding: MessageForwardSelection<MessageView> | null;
  private readIds = new Set<string>();
  private views: readonly MessageView[] | null = null;
  private headerPhoto: AbortController | null = null;
  private pending: HistoryUpdate | null = null;
  constructor(options: HistoryPresentation) {
    this.options = options;
    this.forwarding =
      options.forwarding && options.flush
        ? new MessageForwardSelection({
            history: () => options.node('[data-message-history]'),
            views: () => dailyViews(this.views ?? []),
            signal: options.signal,
            directory: options.forwarding,
            run: options.run,
            stage: options.actions.forward,
            flush: options.flush,
          })
        : null;
  }
  clear(): void {
    this.forwarding?.clear();
    this.pending = null;
    this.views = null;
    this.readIds.clear();
    this.externalRows.clear();
  }
  clearMedia(): void {
    this.externalRows.clear();
  }
  /** Apply background results only when the conversation is visible. Closing
   * the gate still hides content immediately, including in hidden tabs. */
  resume(): void {
    if (this.pending !== null) this.render(this.views, this.pending);
  }
  render(
    rows: readonly MessageView[] | null,
    update: HistoryUpdate = 'history',
  ): void {
    if (rows === null) this.forwarding?.clear();
    this.views = rows;
    if (rows !== null && !this.options.visible()) {
      this.pending = this.pending === 'history' ? 'history' : update;
      return;
    }
    this.pending = null;
    const history = this.options.node('[data-message-history]');
    if (!history) return;
    const restoreScroll = historyPosition(history);
    this.renderContent(history, update);
    this.forwarding?.update();
    this.renderGate(history);
    this.renderPeer();
    restoreScroll();
    this.options.composerChanged();
  }
  private renderGate(history: HTMLElement): void {
    history.hidden = this.views === null;
    const gate = this.options.node('[data-message-gate]');
    if (gate) {
      gate.hidden = this.views !== null;
      gate.textContent = t(
        'Sincronizando mensagens… O histórico abre após conferir as atualizações e exclusões.',
      );
    }
    const older = this.options.node('[data-message-older]');
    if (older) older.hidden = dailyViews(this.views ?? []).length === 0;
  }
  private renderContent(history: HTMLElement, update: HistoryUpdate): void {
    if (update === 'pending') return;
    if (update === 'history') {
      if (this.views === null) this.options.attachments.clearMedia();
      this.externalRows.render(
        history,
        dailyViews(this.views ?? []).map((view) => ({
          id: view.id,
          key: this.rowKey(view),
          render: (signal) => this.renderMessage(view, signal),
        })),
        this.options.signal(),
      );
      this.renderStates();
    } else if (this.views !== null) this.renderStates();
  }
  private rowKey(view: DailyView<MessageView>): string {
    const original = view.content.reply
      ? dailyViews(this.views ?? []).find(
          (row) => row.id === view.content.reply,
        )
      : null;
    return JSON.stringify([
      view.kind,
      view.hash,
      view.text,
      view.content,
      view.reactions,
      view.ownReaction,
      view.sentAt,
      view.edited,
      view.archived,
      view.own,
      view.peer,
      view.author,
      view.state === 'Suspensa',
      original?.content.text.slice(0, 120),
      this.options.context().selected?.localOnly,
    ]);
  }
  renderStates(): void {
    updateMessageStates(
      this.options.node('[data-message-history]'),
      new Map(
        dailyViews(this.views ?? []).map((view) => [
          view.id,
          this.messageState(view),
        ]),
      ),
    );
  }
  private peerLabel(): string {
    const { selected } = this.options.context();
    return (
      selected?.name || selected?.address || t('Selecione um contato aprovado')
    );
  }
  private renderPeer(): void {
    const { selected, calls } = this.options.context();
    this.renderPeerIdentity();
    const call = this.options.node('[data-call-start]');
    if (call) call.hidden = !calls || !!selected?.localOnly;
    const form = this.options.node('[data-message-form]');
    if (form) form.hidden = selected?.localOnly === true;
  }
  private renderPeerIdentity(): void {
    const { selected } = this.options.context();
    const title = this.options.node('[data-message-peer]');
    if (title) {
      title.textContent = selected
        ? displayName(this.peerLabel())
        : this.peerLabel();
      title.title = selected?.address ?? '';
    }
    const avatar = this.options.node('[data-chat-avatar]');
    if (!avatar) return;
    paintAvatar(avatar, {
      label: this.peerLabel(),
      seed: selected?.address ?? '',
    });
    this.paintHeaderPhoto(avatar, selected);
  }
  /** Each header paint cancels the previous photo request. */
  private paintHeaderPhoto(
    avatar: HTMLElement,
    selected: ConversationPeer | null,
  ): void {
    this.headerPhoto?.abort();
    this.headerPhoto = new AbortController();
    if (!selected || selected.localOnly) return;
    this.options.peerPhoto?.(
      avatar,
      selected.accountId,
      this.headerPhoto.signal,
    );
  }
  private messageState(view: DailyView<MessageView>): HTMLElement {
    const detail = document.createElement('small');
    detail.className = 'message-meta';
    const checks = messageChecks({ ...view, read: this.readIds.has(view.id) });
    if (checks)
      detail.append(
        checksIcon({
          ...checks,
          label: t('{0}. {1}', [checks.label, messageStateText(view.state)]),
        }),
      );
    else if (view.state === receivedState)
      detail.title = messageStateText(view.state);
    else detail.textContent = messageStateText(view.state);
    if (view.edited)
      detail.prepend(detail.childNodes.length ? t('Editada · ') : t('Editada'));
    const time = messageTime(view.sentAt);
    if (time) detail.prepend(time);
    return detail;
  }
  private renderAnnotations(
    view: DailyView<MessageView>,
    article: HTMLElement,
  ): void {
    if (view.content.reply) {
      const reply = document.createElement('small');
      const original = dailyViews(this.views ?? []).find(
        (row) => row.id === view.content.reply,
      );
      reply.textContent = original
        ? t('Em resposta: {0}', [original.content.text.slice(0, 120)])
        : t('Resposta: mensagem original fora desta página ou indisponível.');
      article.append(reply);
    }
    if (view.content.forwarded) {
      const forwarded = document.createElement('small');
      forwarded.textContent = t('Encaminhada');
      article.append(forwarded);
    }
  }
  private renderMessage(
    view: DailyView<MessageView>,
    signal: AbortSignal,
  ): HTMLElement {
    const article = document.createElement('article');
    const { remove, ...actions } = this.options.actions;
    article.className = view.own ? 'chat-message own' : 'chat-message';
    article.dataset['message'] = view.id;
    article.setAttribute(
      'aria-label',
      view.own
        ? t('Mensagem enviada por você')
        : t('Mensagem recebida de {0}', [this.peerLabel()]),
    );
    const text = document.createElement('p');
    this.renderMessageContent({ article, text, view, signal });
    if (view.kind === 'text' && this.options.externalMedia)
      showExternalVideos(article, view.content.text, {
        privacy: this.options.externalMedia,
        signal,
      });
    const detail = this.messageState(view);
    this.renderAnnotations(view, article);
    article.append(
      text,
      detail,
      messageActions({
        ...actions,
        signal,
        view,
        forward: () => this.forwarding?.start(view),
        peers: this.options.context().peers.filter((peer) => !peer.localOnly),
        replyAllowed: !this.options.context().selected?.localOnly,
        // A remove capability exists in composition, but is offered only for an own live row.
        ...(!view.archived && view.own ? { remove: () => remove(view) } : {}),
      }),
    );
    if (view.reactions.length)
      article.append(
        messageReactions({
          reactions: view.reactions,
          ownReaction: view.ownReaction,
          action: actions.action,
          remove: view.archived ? null : () => actions.react(view, ''),
        }),
      );
    return article;
  }
  private renderMessageContent(input: {
    article: HTMLElement;
    text: HTMLElement;
    view: DailyView<MessageView>;
    signal: AbortSignal;
  }): void {
    const { article, text, view, signal } = input;
    const { session, peers } = this.options.context();
    if (view.kind === 'attachment') {
      this.options.attachments.render({
        article,
        view,
        signal,
        load: this.options.media,
        run: this.options.run,
      });
    } else if (gifUrls(view.content.text).length)
      this.renderGif(text, view.content.text, signal);
    else if (
      !this.options.representatives?.renderCard(
        article,
        view.content.text,
        view.own
          ? session
          : (peers.find((peer) => peer.accountId === view.peer) ?? null),
      )
    )
      emojiText(text, view.content.text);
  }
  private renderGif(
    text: HTMLElement,
    value: string,
    signal: AbortSignal,
  ): void {
    if (!this.options.externalMedia) return emojiText(text, value);
    showGifText(text, value, {
      renderText: emojiText,
      privacy: this.options.externalMedia,
      signal,
    });
  }
  private readableWindow(): {
    peer: string;
    views: readonly MessageView[];
  } | null {
    const { selected } = this.options.context();
    if (
      !selected ||
      selected.localOnly ||
      this.views === null ||
      !this.options.visible() ||
      !this.options.node('[data-message-history]')?.getClientRects().length
    )
      return null;
    return { peer: selected.accountId, views: this.views };
  }
  private stillVisible(peer: string, views: readonly MessageView[]): boolean {
    return (
      this.views === views &&
      this.options.context().selected?.accountId === peer &&
      this.options.visible()
    );
  }
  async markRead(daily: Pick<Daily, 'readConversation'>): Promise<void> {
    const window = this.readableWindow();
    if (!window) return;
    const { views, peer } = window;
    const incoming = views
      .filter(
        (row) =>
          !row.own &&
          !row.archived &&
          !row.relation &&
          row.kind !== 'profile' &&
          row.state !== messageStates.suspended,
      )
      .map((row) => row.id);
    const outgoing = views
      .filter(
        (row) =>
          row.own && !row.archived && !row.relation && row.kind !== 'profile',
      )
      .map((row) => row.id);
    const receipts = await daily.readConversation({
      peer,
      incoming,
      outgoing,
      current: () => this.stillVisible(peer, views),
    });
    if (receipts === null || !this.stillVisible(peer, views)) return;
    this.readIds = receipts;
    this.renderStates();
  }
}
