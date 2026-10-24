import { t } from '../../shared/i18n/index.ts';
import { socialAttachment } from '../../shared/social-media/index.ts';
import { AttachmentUi } from '../attachment-ui/index.ts';
import { EmojiPicker } from '../emoji/index.ts';
import { historyPosition } from '../chat-ui/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import type { SocialDms } from '../social-dm/index.ts';
import { dmBubble } from './dm-chat.ts';
import type { DmView } from './dm-chat.ts';
import { dmMessageMenu, dmReactionChips } from './dm-message-menu.ts';

export type DmPage = Awaited<ReturnType<SocialDms['cached']>>;
export type DmItem = DmPage['items'][number];
interface HistoryOptions {
  playback: VoicePlayback;
  privacy: ExternalMediaConsent;
  controller: Pick<SocialDms, 'media'>;
  run: (work: () => Promise<void>) => Promise<void>;
  react: (item: DmItem, emoji: string) => Promise<void>;
  edit: (item: DmItem) => void;
}
/** Owns one displayed message page, row reuse and media/menu disposal.
 * Authority, verified reading and conversation selection remain with their existing owners. */
export class DmHistory {
  private readonly options: HistoryOptions;
  private readonly emoji = new EmojiPicker();
  private readonly mediaUi: AttachmentUi;
  private abort = new AbortController();
  private readonly rows = new Map<
    string,
    { key: string; row: HTMLElement; stop: () => void }
  >();
  private nextBefore: number | null = null;
  constructor(options: HistoryOptions) {
    this.options = options;
    this.mediaUi = new AttachmentUi(options.playback, () => {});
  }
  get signal(): AbortSignal {
    return this.abort.signal;
  }
  get next(): number | null {
    return this.nextBefore;
  }
  clear(): void {
    this.abort.abort();
    this.abort = new AbortController();
    for (const held of this.rows.values()) held.stop();
    this.rows.clear();
    this.mediaUi.clearMedia();
  }
  reset(): void {
    this.emoji.reset();
    this.clear();
    this.nextBefore = null;
  }
  /**
   * Rows are reused by id and content, so a refresh neither reloads media nor
   * restarts an embedded video; only new or changed messages are drawn.
   */
  render(
    current: Pick<DmView, 'history' | 'older' | 'gate'>,
    page: DmPage,
    input: { selected: string; localMedia: boolean },
  ): void {
    const restore = historyPosition(current.history);
    const keep = new Set(page.items.map((item) => item.id));
    for (const [id, held] of this.rows)
      if (!keep.has(id)) {
        held.stop();
        held.row.remove();
        this.rows.delete(id);
      }
    for (const child of [...current.history.children])
      if (!(child instanceof HTMLElement) || !child.dataset['message'])
        child.remove();
    let cursorNode = current.history.firstChild;
    for (const item of page.items) {
      const row = this.messageRow(item, page, input);
      if (row === cursorNode) cursorNode = row.nextSibling;
      else current.history.insertBefore(row, cursorNode);
    }
    if (!page.items.length) current.gate.textContent = t('No messages yet.');
    current.older.hidden = page.next === null;
    this.nextBefore = page.next;
    restore();
  }
  private messageRow(
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
      held = this.rows.get(item.id);
    if (held?.key === key) return held.row;
    held?.stop();
    held?.row.remove();
    const handle = item.peer.handle,
      bubble = dmBubble(
        { ...item, text: item.displayText },
        {
          own: item.sender === page.self,
          handle,
          privacy: this.options.privacy,
          signal: this.abort.signal,
        },
      );
    if (item.kind === 'attachment' && item.media)
      this.mediaUi.render({
        article: bubble.row,
        view: { ...item, peer: input.selected, archived: input.localMedia },
        saveNotice: t(
          'The saved copy is outside the vault and personal cleanup. Only open files from sources you trust.',
        ),
        content: socialAttachment(JSON.parse(item.text) as unknown, item.media),
        load: (_view, thumbnail) =>
          this.options.controller.media(
            item,
            thumbnail,
            false,
            input.localMedia,
          ),
        run: this.options.run,
      });
    const stopMenu = dmMessageMenu(bubble.row, {
      text:
        item.kind === 'text'
          ? item.text
          : socialAttachment(JSON.parse(item.text) as unknown, item.media!)
              .caption,
      signal: this.abort.signal,
      picker: this.emoji,
      run: this.options.run,
      ...(!input.localMedia
        ? {
            react: (emoji: string) => this.options.react(item, emoji),
            edit: () => this.options.edit(item),
            editable: this.editable(item),
          }
        : {}),
    });
    dmReactionChips(bubble.row, {
      reactions: item.reactions,
      ownReaction: item.ownReaction,
      run: this.options.run,
      ...(!input.localMedia
        ? { react: () => this.options.react(item, '') }
        : {}),
    });
    this.rows.set(item.id, {
      key,
      row: bubble.row,
      stop: () => {
        stopMenu();
        bubble.stop();
      },
    });
    return bubble.row;
  }
  private editable(item: DmItem): boolean {
    return item.own && item.kind === 'text';
  }
}
