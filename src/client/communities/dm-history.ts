import type { DmOutgoingMedia } from './dm-outgoing-media.ts';
import {
  chatSyncActive,
  traceSendChecks,
} from '../chat-sync-diagnostics/index.ts';
import { MessageDeletionSelection } from '../message-selection/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { decodeDailyText } from '../../shared/daily/index.ts';
import { socialAttachment } from '../../shared/social-media/index.ts';
import { AttachmentUi } from '../attachment-ui/index.ts';
import { EmojiPicker } from '../emoji/index.ts';
import { outgoingTextRows } from '../text-send/index.ts';
import type { OutgoingText } from '../text-send/index.ts';
import { historyPosition, watchHistoryPosition } from '../chat-ui/index.ts';
import {
  dayHeading,
  withDayHeadings,
  messageRuns,
  replyQuote,
  markRuns,
} from '../message-presentation/index.ts';
import type { RunPlace } from '../message-presentation/index.ts';
import { revealMessage } from '../chat-ui/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import type { SocialDms } from '../social-dm/index.ts';
import { dmBubble } from './dm-chat.ts';
import type { DmView } from './dm-chat.ts';
import { dmMessageMenu, dmReactionChips } from './dm-message-menu.ts';
import { renderViewOnce } from '../view-once-ui/index.ts';
import { observeDmRows } from './dm-delivery.ts';

export type DmPage = Awaited<ReturnType<SocialDms['cached']>>;
export type DmItem = DmPage['items'][number];
interface HistoryOptions {
  playback: VoicePlayback;
  privacy: ExternalMediaConsent;
  controller: Pick<SocialDms, 'media'> &
    Partial<Pick<SocialDms, 'openViewOnce' | 'mediaPreviews'>>;
  run: (work: () => Promise<void>) => Promise<void>;
  react: (item: DmItem, emoji: string) => Promise<void>;
  edit: (item: DmItem) => void;
  reply?: (item: DmItem) => void;
  remove?: (item: DmItem) => Promise<void>;
  outgoingMedia?: Pick<DmOutgoingMedia, 'rows' | 'take'>;
  outgoing?: (peer: string) => readonly OutgoingText[];
  retryOutgoing?: () => void;
}
/** Owns one displayed message page, row reuse and media/menu disposal.
 * Authority, verified reading and conversation selection remain with their existing owners. */
export class DmHistory {
  private readonly options: HistoryOptions;
  private readonly deletion: MessageDeletionSelection;
  private readonly emoji = new EmojiPicker();
  private readonly mediaUi: AttachmentUi;
  private abort = new AbortController();
  private readonly rows = new Map<
    string,
    { key: string; row: HTMLElement; stop: () => void }
  >();
  private readonly headings = new Map<string, HTMLElement>();
  constructor(options: HistoryOptions) {
    this.options = options;
    this.deletion = new MessageDeletionSelection(options.run);
    this.mediaUi = new AttachmentUi(options.playback, () => {});
  }
  get signal(): AbortSignal {
    return this.abort.signal;
  }
  /** Messages currently drawn. */
  get shown(): number {
    return this.rows.size;
  }
  clear(): void {
    this.deletion.clear();
    this.abort.abort();
    this.abort = new AbortController();
    for (const held of this.rows.values()) held.stop();
    this.rows.clear();
    this.headings.clear();
    this.mediaUi.clearMedia();
  }
  reset(): void {
    this.emoji.reset();
    this.clear();
  }
  /**
   * Rows are reused by id and content, so a refresh neither reloads media nor
   * restarts an embedded video; only new or changed messages are drawn.
   */
  render(
    current: Pick<DmView, 'history' | 'gate'>,
    page: DmPage,
    input: { selected: string; localMedia: boolean },
  ): void {
    const previous =
      !input.localMedia && chatSyncActive() ? new Set(this.rows.keys()) : null;
    watchHistoryPosition(current.history, this.abort.signal);
    const restore = historyPosition(
      current.history,
      input.localMedia ? undefined : page.items,
    );
    const pending = this.pending(page, input);
    const keep = new Set([
      ...page.items.map((item) => item.id),
      ...pending.map((item) => item.id),
    ]);
    for (const [id, held] of this.rows)
      if (!keep.has(id)) {
        held.stop();
        held.row.remove();
        this.rows.delete(id);
      }
    // Visual B: one author's messages within five minutes form a run.
    const runs = messageRuns(
        page.items,
        (item) => item.sender,
        (item) => item.sentAt,
      ),
      runOf = new Map(page.items.map((item, i) => [item.id, runs[i]!]));
    const wanted = withDayHeadings<{ item?: DmItem; day?: string }>(
      page.items.map((item) => ({ item })),
      (entry) => entry.item?.sentAt,
      (day) => ({ day: day.label }),
    ).map((entry) =>
      entry.item
        ? this.messageRow(
            entry.item,
            page,
            input,
            runOf.get(entry.item.id) ?? 'single',
          )
        : this.heading(entry.day ?? ''),
    );
    for (const draft of pending) wanted.push(this.pendingRow(draft));
    this.reconcile(current.history, wanted);
    markRuns(current.history, runOf);
    this.emptyState(current.gate, wanted.length === 0);
    this.deletion.update(
      current.history,
      input.localMedia
        ? []
        : page.items
            .filter((item) => item.own && !item.relation && this.options.remove)
            .map((item) => ({
              id: item.id,
              row: this.rows.get(item.id)!.row,
              remove: () => this.options.remove!(item),
            })),
    );
    current.history.hidden = false;
    if (!input.localMedia) traceSendChecks(current.history);
    restore();
    if (previous)
      observeDmRows({
        history: current.history,
        messages: page.items,
        row: (id) => this.rows.get(id)?.row,
        signal: this.abort.signal,
        previous,
      });
  }
  private pending(
    page: DmPage,
    input: { selected: string; localMedia: boolean },
  ) {
    return [
      ...outgoingTextRows({
        drafts: input.localMedia
          ? []
          : (this.options.outgoing?.(input.selected) ?? []),
        shown: new Set(page.items.map((item) => item.id)),
        quote: (id) => page.items.find((item) => item.id === id)?.displayText,
        retry: this.options.retryOutgoing ?? (() => {}),
      }),
      ...(input.localMedia
        ? []
        : (this.options.outgoingMedia?.rows(
            input.selected,
            new Set(page.items.map((item) => item.id)),
          ) ?? [])),
    ];
  }
  private reconcile(history: HTMLElement, wanted: HTMLElement[]): void {
    const shown = new Set<Element>(wanted);
    for (const child of [...history.children])
      if (!shown.has(child)) child.remove();
    let cursor = history.firstChild;
    for (const row of wanted) {
      if (row === cursor) cursor = row.nextSibling;
      else history.insertBefore(row, cursor);
    }
  }
  private emptyState(gate: HTMLElement, empty: boolean): void {
    if (empty) gate.textContent = t('No messages yet.');
    else if (gate.textContent === t('No messages yet.')) gate.textContent = '';
  }
  private pendingRow(
    draft: ReturnType<typeof outgoingTextRows>[number],
  ): HTMLElement {
    const held = this.rows.get(draft.id);
    if (held?.key === draft.key) return held.row;
    held?.stop();
    held?.row.remove();
    const row = draft.render();
    this.rows.set(draft.id, { key: draft.key, row, stop: () => {} });
    return row;
  }
  /** One heading element per day label, reused across refreshes. */
  private heading(label: string): HTMLElement {
    const held = this.headings.get(label);
    if (held) return held;
    const heading = dayHeading(label);
    this.headings.set(label, heading);
    return heading;
  }
  private renderReply(row: HTMLElement, item: DmItem, page: DmPage): void {
    const encoded =
      item.kind === 'text'
        ? item.text
        : socialAttachment(JSON.parse(item.text) as unknown, item.media!)
            .caption;
    const replyId = decodeDailyText(encoded).reply;
    if (replyId) {
      const original = page.items.find((row) => row.id === replyId);
      row.prepend(
        replyQuote(
          original
            ? {
                author:
                  original.sender === page.self
                    ? t('You')
                    : `@${original.peer.handle}`,
                excerpt: replyExcerpt(original.displayText),
                open: () => this.revealLoaded(original.id),
              }
            : { author: null, excerpt: null },
        ),
      );
    }
  }
  /** Marks a message of the shown page, such as a quoted original. */
  private revealLoaded(id: string): void {
    const row = this.rows.get(id)?.row;
    void revealMessage(id, {
      row: () => (row?.isConnected ? row : null),
      older: { available: () => false, load: () => Promise.resolve(false) },
      valid: () => !this.abort.signal.aborted,
    });
  }
  private messageRow(
    item: DmItem,
    page: DmPage,
    input: { selected: string; localMedia: boolean },
    run: RunPlace,
  ): HTMLElement {
    const localMedia = input.localMedia || item.localOnly === true,
      key = JSON.stringify([
        item.kind,
        item.text,
        item.reactions,
        item.ownReaction,
        item.sentAt,
        item.displayText,
        item.edited,
        localMedia,
        input.localMedia,
      ]),
      held = this.rows.get(item.id);
    if (held?.key === key) return held.row;
    held?.stop();
    held?.row.remove();
    const lifetime = new AbortController();
    const signal = AbortSignal.any([this.abort.signal, lifetime.signal]);
    const handle = item.peer.handle,
      bubble = dmBubble(
        { ...item, text: item.displayText },
        {
          own: item.sender === page.self,
          handle,
          privacy: this.options.privacy,
          signal,
        },
      );
    bubble.row.dataset['run'] = run;
    this.renderReply(bubble.row, item, page);
    this.renderAttachment(bubble.row, item, { ...input, localMedia, signal });
    const metadata = messageViewOnce(item);
    if (metadata) {
      bubble.row.querySelector('p')?.remove();
      renderViewOnce({
        host: bubble.row,
        id: item.id,
        own: item.own,
        metadata,
        signal,
        current: () => bubble.row.isConnected && !signal.aborted,
        open: (diagnostic, media) =>
          this.options.controller.openViewOnce?.(
            input.selected,
            item.id,
            metadata,
            { signal, diagnostic, media },
          ) ?? Promise.reject(new Error('View-once message unavailable.')),
      });
    }
    const stopMenu = dmMessageMenu(bubble.row, {
      viewOnce: !!metadata,
      text:
        item.kind === 'text'
          ? item.displayText
          : decodeDailyText(
              socialAttachment(JSON.parse(item.text) as unknown, item.media!)
                .caption,
            ).text,
      signal,
      picker: this.emoji,
      run: this.options.run,
      ...this.messageCapabilities(item, {
        readOnly: input.localMedia,
        local: localMedia,
      }),
    });
    dmReactionChips(bubble.row, {
      reactions: item.reactions,
      ownReaction: item.ownReaction,
      run: this.options.run,
      ...(!localMedia ? { react: () => this.options.react(item, '') } : {}),
    });
    this.rows.set(item.id, {
      key,
      row: bubble.row,
      stop: () => {
        lifetime.abort();
        stopMenu();
        bubble.stop();
      },
    });
    return bubble.row;
  }
  /** Quoting local content is independent of permission to mutate its live original. */
  private messageCapabilities(
    item: DmItem,
    input: { readOnly: boolean; local: boolean },
  ) {
    return {
      ...(!input.readOnly && this.options.reply
        ? { reply: () => this.options.reply?.(item) }
        : {}),
      ...(!input.local ? this.mutationCapabilities(item) : {}),
    };
  }
  private mutationCapabilities(item: DmItem) {
    return {
      react: (emoji: string) => this.options.react(item, emoji),
      edit: () => this.options.edit(item),
      editable: this.editable(item),
      ...(item.own && this.options.remove
        ? {
            remove: () => {
              if (matchMedia('(max-width: 700px)').matches)
                this.deletion.begin(item.id);
              else void this.options.run(() => this.options.remove!(item));
            },
          }
        : {}),
    };
  }
  private renderAttachment(
    article: HTMLElement,
    item: DmItem,
    input: { selected: string; localMedia: boolean; signal: AbortSignal },
  ): void {
    if (item.kind !== 'attachment' || !item.media) return;
    const content = socialAttachment(
      JSON.parse(item.text) as unknown,
      item.media,
    );
    this.mediaUi.render({
      article,
      signal: input.signal,
      view: { ...item, peer: input.selected, archived: input.localMedia },
      saveNotice: t(
        'The saved copy is outside the vault and personal cleanup. Only open files from sources you trust.',
      ),
      content,
      previews: this.options.controller.mediaPreviews?.(item, input.localMedia),
      load: (_view, thumbnail) => {
        const local =
          !input.localMedia && item.own
            ? this.options.outgoingMedia?.take(
                item.id,
                thumbnail,
                content.file.ref.hash,
              )
            : null;
        return local
          ? Promise.resolve(local)
          : this.options.controller.media(
              item,
              thumbnail,
              false,
              input.localMedia,
            );
      },
      run: this.options.run,
    });
  }
  private editable(item: DmItem): boolean {
    return item.own && item.kind === 'text';
  }
}

function messageViewOnce(item: DmItem) {
  return item.kind === 'text' ? decodeDailyText(item.text).viewOnce : undefined;
}

function replyExcerpt(text: string): string {
  const clean = text.replace(/\s+/gu, ' ').trim();
  if (!clean) return t('Message');
  return clean.length > 120 ? `${clean.slice(0, 120)}…` : clean;
}
