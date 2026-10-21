import { conversationPreview } from '../conversation-preview/index.ts';
import type { ConversationPreviewLoader } from '../conversation-preview/index.ts';
import { dailyViews } from '../daily-text/index.ts';
import type { MessageView, ConversationProjection } from './controller.ts';
import type { HistoryUpdate } from '../message-visibility/index.ts';

interface PreviewPublication {
  rows: readonly MessageView[] | null;
  projection: ConversationProjection | undefined;
  update?: HistoryUpdate;
  online: boolean;
  localOnly: boolean;
  previews: ConversationPreviewLoader;
}

/** Selected-window receipts already passed the UI's current-window guard.
 * Update only a latest preview whose exact outgoing message was in that read. */
export function publishVerifiedPreviewReceipts(input: {
  peer: string;
  outgoing: readonly string[];
  read: ReadonlySet<string>;
  previews: ConversationPreviewLoader;
}): void {
  const preview = input.previews.values.get(input.peer);
  if (!preview?.own || !input.outgoing.includes(preview.id)) return;
  input.previews.publish(input.peer, {
    ...preview,
    read: input.read.has(preview.id),
  });
}

/** The controller's complete verified publication is the authority boundary.
 * Older pages, archives, offline views and pending drafts cannot replace the
 * latest online directory preview. No read ACK or additional IO is needed. */
export function publishVerifiedConversationPreview(
  input: PreviewPublication,
): void {
  const { rows, projection, previews } = input;
  if (!rows) {
    closePendingPreview(input);
    return;
  }
  if (
    !projection?.latest ||
    !projection.peer ||
    !input.online ||
    input.localOnly
  )
    return;
  const peer = projection.peer;
  const latest = dailyViews(rows)
    .filter((row) => row.peer === peer && !row.archived)
    .reduce<ReturnType<typeof dailyViews<MessageView>>[number] | null>(
      (last, row) =>
        !last || (row.sequence ?? 0) > (last.sequence ?? 0) ? row : last,
      null,
    );
  const previous = previews.values.get(peer);
  previews.publish(
    peer,
    latest
      ? conversationPreview({
          ...latest,
          displayText: latest.content.text,
          read: previous?.id === latest.id && previous.read,
        })
      : null,
  );
}

/** A removal gate also closes the selected preview; navigation alone does not. */
function closePendingPreview(input: PreviewPublication): void {
  if (input.update === 'pending' && input.projection?.peer)
    input.previews.publish(input.projection.peer, null);
}
