import type { DailyView } from '../daily-text/index.ts';
import type { MessageView } from './controller.ts';

/** Delivery/read receipts have their own renderer. Content changes replace only
 * the affected row and replies whose visible quote depends on that content. */
export function messageRowKeys(
  views: DailyView<MessageView>[],
): Map<string, string> {
  const byId = new Map(views.map((view) => [view.id, view]));
  return new Map(
    views.map((view) => [
      view.id,
      JSON.stringify([
        view.hash,
        view.kind,
        view.peer,
        view.own,
        view.author,
        view.content,
        view.text,
        view.edited,
        view.reactions,
        view.archived,
        view.state === 'Suspensa',
        view.content.reply
          ? (byId.get(view.content.reply)?.content.text.slice(0, 120) ?? null)
          : null,
      ]),
    ]),
  );
}
