import { historyPosition, updateMessageStates } from '../chat-ui/index.ts';
import { displayName, paintAvatar } from '../appearance/index.ts';
import type { HistoryUpdate } from '../message-visibility/index.ts';
import { dailyViews } from '../daily-text/index.ts';
import type { DailyView } from '../daily-text/index.ts';
import { messageActions } from '../message-actions/index.ts';
import { checksIcon, messageChecks } from '../message-status/index.ts';
import { gifUrls, showGifText } from '../gif-search/index.ts';
import { showExternalVideos } from '../external-video/index.ts';
import { externalVideoIds } from '../../shared/external-video/index.ts';
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
  actions: Pick<
    Actions,
    'action' | 'picker' | 'choose' | 'react' | 'forward'
  > & {
    remove: (view: MessageView) => Promise<void>;
  };
}

/** Consumes only verified windows. Never opens storage or bypasses the gate. */
export class MessageHistoryUi {
  private readonly options: HistoryPresentation;
  private readonly externalRows = new ExternalTextHistory();
  private readIds = new Set<string>();
  private views: readonly MessageView[] | null = null;
  constructor(options: HistoryPresentation) {
    this.options = options;
  }
  clear(): void {
    this.views = null;
    this.readIds.clear();
    this.externalRows.clear();
  }
  clearMedia(): void {
    this.externalRows.clear();
  }
  render(
    rows: readonly MessageView[] | null,
    update: HistoryUpdate = 'history',
  ): void {
    this.views = rows;
    const history = this.options.node('[data-message-history]');
    if (!history) return;
    const restoreScroll = historyPosition(history);
    this.renderContent(history, update);
    history.hidden = rows === null;
    const gate = this.options.node('[data-message-gate]');
    if (gate) {
      gate.hidden = rows !== null;
      gate.textContent =
        'Sincronizando mensagens… O histórico abre após conferir as atualizações e exclusões.';
    }
    const older = this.options.node('[data-message-older]');
    if (older) older.hidden = dailyViews(rows ?? []).length === 0;
    this.renderPeer();
    restoreScroll();
    this.options.composerChanged();
  }
  private renderContent(history: HTMLElement, update: HistoryUpdate): void {
    if (update === 'history') {
      this.options.attachments.clearMedia();
      this.externalRows.render(
        history,
        dailyViews(this.views ?? []).map((view) => ({
          id: view.id,
          key:
            view.kind === 'text' &&
            (externalVideoIds(view.content.text).length > 0 ||
              gifUrls(view.content.text).length > 0)
              ? JSON.stringify([view.content, view.reactions, view.archived])
              : null,
          render: (signal) => this.renderMessage(view, signal),
        })),
        this.options.signal(),
      );
      this.renderStates();
    } else if (this.views !== null) this.renderStates();
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
      selected?.name || selected?.address || 'Selecione um contato aprovado'
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
    if (avatar)
      paintAvatar(avatar, {
        label: this.peerLabel(),
        seed: selected?.address ?? '',
      });
  }
  private messageState(view: DailyView<MessageView>): HTMLElement {
    const detail = document.createElement('small');
    detail.className = 'message-meta';
    const checks = messageChecks({ ...view, read: this.readIds.has(view.id) });
    if (checks)
      detail.append(
        checksIcon({ ...checks, label: `${checks.label}. ${view.state}` }),
      );
    else if (view.state === receivedState) detail.title = view.state;
    else detail.textContent = view.state;
    if (view.edited)
      detail.prepend(detail.childNodes.length ? 'Editada · ' : 'Editada');
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
        ? 'Mensagem enviada por você'
        : `Mensagem recebida de ${this.peerLabel()}`,
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
        peers: this.options.context().peers.filter((peer) => !peer.localOnly),
        replyAllowed: !this.options.context().selected?.localOnly,
        // A remove capability exists in composition, but is offered only for an own live row.
        ...(!view.archived && view.own ? { remove: () => remove(view) } : {}),
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
  async markRead(daily: Pick<Daily, 'read' | 'receipts'>): Promise<void> {
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
          row.state !== 'Suspensa',
      )
      .map((row) => row.id);
    if (incoming.length) await daily.read(peer, incoming);
    if (!this.stillVisible(peer, views)) return;
    const receipts = await daily.receipts(
      views
        .filter(
          (row) =>
            row.own && !row.archived && !row.relation && row.kind !== 'profile',
        )
        .map((row) => row.id),
    );
    if (!this.stillVisible(peer, views)) return;
    this.readIds = receipts;
    this.renderStates();
  }
}
