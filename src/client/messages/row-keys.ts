import type { DailyView } from '../daily-text/index.ts';
import type { MessageView } from './controller.ts';
import { messageStates } from '../message-state/index.ts';

/** Delivery/read receipts have their own renderer. Content changes replace only
 * the affected row and replies whose visible quote depends on that content. */
export function messageRowKeys(
  views: DailyView<MessageView>[],
  localOnly?: boolean,
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
        view.ownReaction,
        view.sentAt,
        view.archived,
        view.state === messageStates.suspended,
        view.content.reply
          ? (byId.get(view.content.reply)?.content.text.slice(0, 120) ?? null)
          : null,
        localOnly,
      ]),
    ]),
  );
}
