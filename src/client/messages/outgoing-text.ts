import { traceDirectMessage } from '../chat-sync-diagnostics/index.ts';
import { decodeDailyText } from '../../shared/daily/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { emojiText } from '../emoji/index.ts';
import { dailyViews } from '../daily-text/index.ts';
import { messageTime } from '../message-presentation/index.ts';
import { checksIcon, messageChecks } from '../message-status/index.ts';
import type { MessageView } from './controller.ts';
import type { TextDraft } from '../text-send/index.ts';

export interface OutgoingText extends TextDraft {
  saved: boolean;
  accepted: boolean;
  failure: 'save' | 'send' | null;
}

/** Session-only presentation of own drafts. At most 64 encoded texts of 128 KiB;
 * durable ciphertext, authorization and actual delivery stay in their owners. */
export class OutgoingTexts {
  private readonly held = new Map<string, OutgoingText>();
  private readonly offscreen = new Set<string>();
  private transferFailed = false;
  private loading: { key: string; task: Promise<TextDraft[]> } | null = null;
  update(draft: TextDraft, phase: 'admitted' | 'saved' | 'save-failed'): void {
    if (phase === 'admitted') {
      this.held.set(draft.id, {
        ...draft,
        saved: false,
        accepted: false,
        failure: null,
      });
      this.trim();
      traceDirectMessage(
        this,
        { event: 'direct-send', reason: 'admitted' },
        draft.id,
      );
      return;
    }
    const value = this.held.get(draft.id);
    if (!value) return;
    value.saved = phase === 'saved';
    if (value.saved)
      traceDirectMessage(
        this,
        { event: 'direct-send', reason: 'staged' },
        draft.id,
      );
    value.failure =
      phase === 'save-failed' ? 'save' : this.transferFailed ? 'send' : null;
  }
  restore(drafts: readonly TextDraft[]): void {
    for (const draft of drafts) {
      if (this.has(draft.id)) continue;
      if (new TextEncoder().encode(draft.text).length > 131072) continue;
      this.held.set(draft.id, {
        ...draft,
        saved: true,
        accepted: false,
        failure: this.transferFailed ? 'send' : null,
      });
      this.trim();
    }
  }
  private trim(): void {
    if (this.held.size <= 64) return;
    const oldest = [...this.held.values()].find((value) => value.saved);
    if (oldest) {
      this.held.delete(oldest.id);
      this.offscreen.add(oldest.id);
      if (this.offscreen.size > 128)
        this.offscreen.delete(this.offscreen.values().next().value!);
    }
  }
  forPeer(peer: string | undefined): readonly OutgoingText[] {
    return [...this.held.values()]
      .filter((value) => value.peer === peer)
      .sort((a, b) => {
        const time = (a.createdAt ?? 0) - (b.createdAt ?? 0);
        if (time) return time;
        const first = a.order ?? '\uffff',
          second = b.order ?? '\uffff';
        return first < second ? -1 : first > second ? 1 : 0;
      });
  }
  has(id: string): boolean {
    return this.held.has(id) || this.offscreen.has(id);
  }
  acknowledge(value: { id: string; peer: string }): void {
    const draft = this.held.get(value.id);
    if (!draft || draft.peer !== value.peer) return;
    if (!draft.accepted)
      traceDirectMessage(
        this,
        { event: 'direct-send', reason: 'accepted' },
        value.id,
      );
    draft.accepted = true;
    draft.failure = null;
  }
  observed(rows: readonly MessageView[] | null): void {
    const ids = new Set(rows?.map((row) => row.id));
    for (const id of ids) this.offscreen.delete(id);
    for (const value of this.held.values())
      if (ids.has(value.id) || (rows === null && value.accepted))
        this.held.delete(value.id);
  }
  beginTransfer(): void {
    this.transferFailed = false;
    for (const value of this.held.values())
      if (value.failure === 'send') value.failure = null;
  }
  failTransfer(): void {
    this.transferFailed = true;
    for (const value of this.held.values())
      if (value.saved && !value.accepted) value.failure = 'send';
  }
  retry(): void {
    this.transferFailed = false;
    for (const value of this.held.values()) value.failure = null;
  }
  reset(): void {
    this.held.clear();
    this.offscreen.clear();
    this.transferFailed = false;
  }
  async restorePending(input: {
    peer: string;
    pending: readonly { id: string; peer: string; text?: boolean }[];
    verified: readonly Pick<MessageView, 'id'>[];
    current: () => boolean;
    read: (ids: readonly string[]) => Promise<TextDraft[]>;
  }): Promise<boolean> {
    const verified = new Set(input.verified.map((row) => row.id));
    const ids = input.pending
      .filter(
        (item) =>
          item.peer === input.peer &&
          item.text &&
          !this.has(item.id) &&
          !verified.has(item.id),
      )
      .slice(0, 16)
      .map((item) => item.id);
    if (!ids.length || !input.current()) return false;
    const drafts = await this.load({
      peer: input.peer,
      ids,
      read: () => input.read(ids),
    });
    if (!input.current()) return false;
    this.restore(drafts);
    return drafts.length > 0;
  }
  /** Coalesce repeated projections while one authorized restore is in flight. */
  private async load(input: {
    peer: string;
    ids: readonly string[];
    read: () => Promise<TextDraft[]>;
  }): Promise<TextDraft[]> {
    const key = JSON.stringify([input.peer, input.ids]);
    if (this.loading?.key === key) return this.loading.task;
    if (this.loading) {
      await this.loading.task;
      return this.load(input);
    }
    const task = input.read();
    this.loading = { key, task };
    try {
      return await task;
    } finally {
      if (this.loading?.task === task) this.loading = null;
    }
  }
}

/** Same keyed history as verified rows; confirmation replaces one local row.
 * No remote embeds, receipts or message actions are created for an own draft. */
export function outgoingTextRows(input: {
  drafts: readonly OutgoingText[];
  verified: readonly MessageView[];
  retry: () => void;
}): { id: string; key: string; render: () => HTMLElement }[] {
  if (!input.drafts.length) return [];
  const ids = new Set(input.verified.map((view) => view.id));
  const quotes = new Map(
    dailyViews(input.verified).map((view) => [view.id, view.content.text]),
  );
  return input.drafts
    .filter((draft) => !ids.has(draft.id))
    .map((draft) => {
      const reply = decodeDailyText(draft.text).reply;
      const quote = reply === null ? undefined : quotes.get(reply);
      return {
        id: draft.id,
        key: JSON.stringify(['outgoing', draft, quote]),
        render: () => outgoingBubble({ draft, quote, retry: input.retry }),
      };
    });
}
function outgoingBubble(input: {
  draft: OutgoingText;
  quote: string | undefined;
  retry: () => void;
}): HTMLElement {
  const { draft } = input,
    content = decodeDailyText(draft.text);
  const article = document.createElement('article'),
    text = document.createElement('p');
  article.className = 'chat-message own';
  article.dataset['message'] = draft.id;
  article.dataset['outgoingText'] = 'true';
  article.setAttribute('aria-label', t('chat.outgoing-message'));
  if (content.reply) {
    const quote = document.createElement('small');
    quote.textContent =
      input.quote === undefined
        ? t('Reply: original message is outside this page or unavailable.')
        : t('Replying to: {0}', [input.quote.slice(0, 120)]);
    article.append(quote);
  }
  emojiText(text, content.text);
  article.append(text, outgoingMeta(draft, input.retry));
  return article;
}
function outgoingMeta(draft: OutgoingText, retry: () => void): HTMLElement {
  const meta = document.createElement('small');
  meta.className = 'message-meta';
  const time = messageTime(draft.createdAt);
  if (time) {
    time.setAttribute('aria-label', t('chat.composed-at {0}', [time.title]));
    meta.append(time);
  }
  if (draft.failure) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'message-send-failed';
    button.textContent = '✕';
    button.title = t('chat.send-failed');
    button.setAttribute(
      'aria-label',
      t('{0}. {1}', [
        t(draft.failure === 'save' ? 'chat.save-failed' : 'chat.send-failed'),
        t(draft.failure === 'save' ? 'chat.retry-save' : 'chat.retry-send'),
      ]),
    );
    button.addEventListener('click', retry);
    meta.append(button);
  } else {
    // Owner decision (23/10/2026): one check until a recipient device has
    // it, never a state phrase; the stage stays in the accessible label.
    const checks = messageChecks({
      own: true,
      delivery: 'accepted',
      read: false,
    })!;
    meta.append(
      checksIcon(
        draft.accepted
          ? checks
          : {
              ...checks,
              label: t(draft.saved ? 'message.sending' : 'chat.saving-local'),
            },
      ),
    );
  }
  return meta;
}
