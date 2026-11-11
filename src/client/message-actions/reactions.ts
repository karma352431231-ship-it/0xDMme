import { validReaction } from '../../shared/daily/index.ts';
import type { DailyView } from '../daily-text/index.ts';
import { messageReactions } from '../message-presentation/index.ts';
import type { DailyRow } from '../daily-text/index.ts';

interface ReactionRow<T extends DailyRow> {
  view: DailyView<T>;
  host: HTMLElement;
  displayed: string | null;
  pending: { id: string; emoji: string } | null;
}

/** A reaction updates only its chips. The history row owns media and its lifetime. */
export class HistoryReactions<T extends DailyRow = DailyRow> {
  private readonly rows = new Map<string, ReactionRow<T>>();
  private readonly options: {
    action: Parameters<typeof messageReactions>[0]['action'];
    send: (view: T, emoji: string, id: string) => Promise<void>;
  };

  constructor(options: HistoryReactions<T>['options']) {
    this.options = options;
  }

  mount(view: DailyView<T>, signal: AbortSignal): HTMLElement {
    const host = document.createElement('div');
    if (signal.aborted) return host;
    const row: ReactionRow<T> = { view, host, displayed: null, pending: null };
    this.rows.set(view.id, row);
    signal.addEventListener(
      'abort',
      () => {
        if (this.rows.get(view.id) === row) this.rows.delete(view.id);
      },
      { once: true },
    );
    this.paint(row);
    return host;
  }

  reconcile(views: readonly DailyView<T>[], history: readonly T[]): void {
    const confirmed = new Set(
      history
        .filter((view) => view.own && view.relation?.type === 'reaction')
        .map((view) => view.id),
    );
    for (const view of views) {
      const row = this.rows.get(view.id);
      if (!row) continue;
      row.view = view;
      if (
        row.pending &&
        (confirmed.has(row.pending.id) ||
          row.view.ownReaction === row.pending.emoji)
      )
        row.pending = null;
      this.paint(row);
    }
  }

  closeGate(): void {
    for (const row of this.rows.values()) row.pending = null;
  }

  async change(view: T, emoji: string): Promise<void> {
    const row = this.rows.get(view.id);
    if (
      !row ||
      row.view.hash !== view.hash ||
      row.view.peer !== view.peer ||
      row.view.archived
    )
      return;
    if (!validReaction(emoji)) throw new Error('Invalid reaction.');
    const pending = { id: crypto.randomUUID(), emoji };
    row.pending = pending;
    this.paint(row);
    try {
      await this.options.send(row.view, emoji, pending.id);
    } catch (error: unknown) {
      if (this.rows.get(view.id) === row && row.pending === pending) {
        row.pending = null;
        this.paint(row);
      }
      throw error;
    }
  }

  private paint(row: ReactionRow<T>): void {
    const { view, pending, host } = row;
    const ownReaction = pending?.emoji ?? view.ownReaction;
    const reactions = pending
      ? replaceOwnReaction(view, ownReaction)
      : view.reactions;
    const displayed = JSON.stringify([reactions, ownReaction, view.archived]);
    if (row.displayed === displayed) return;
    row.displayed = displayed;
    messageReactions({
      host,
      reactions,
      ownReaction,
      action: this.options.action,
      remove: view.archived ? null : () => this.change(view, ''),
    });
  }
}

function replaceOwnReaction<T extends DailyRow>(
  view: DailyView<T>,
  emoji: string,
): string[] {
  const reactions = [...view.reactions];
  const own = reactions.indexOf(view.ownReaction);
  if (own !== -1) reactions.splice(own, 1, ...(emoji ? [emoji] : []));
  else if (emoji) reactions.push(emoji);
  return reactions;
}
