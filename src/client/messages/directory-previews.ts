import { messageItems } from './history.ts';
import type { MessageItem } from './history.ts';
import type { DailyRow } from '../daily-text/index.ts';
import type { DeliveryState } from '../message-status/index.ts';
type PreviewView = DailyRow & {
  state: string;
  sentAt?: number;
  delivery?: DeliveryState;
};
import { dailyViews } from '../daily-text/index.ts';
import { conversationPreview } from '../conversation-preview/index.ts';
import type { ConversationPreview } from '../conversation-preview/index.ts';
import { readDelivery } from './delivery.ts';

type Api = (
  operation: string,
  payload: Record<string, unknown>,
) => Promise<unknown>;
/** Bounded latest-message lookup. Uses existing packet verification and crypto;
 * receipts are queried without sending a daily-read acknowledgement. */
export async function readDirectoryPreviews(options: {
  peers: readonly string[];
  api: Api;
  read: (snapshot: unknown, items: MessageItem[]) => Promise<PreviewView[]>;
  guard: () => void;
}): Promise<Map<string, ConversationPreview>> {
  const result = new Map<string, ConversationPreview>();
  if (!options.peers.length) return result;
  const snapshot = await options.api('snapshot', {});
  for (let offset = 0; offset < options.peers.length; offset += 16) {
    options.guard();
    const peers = options.peers.slice(offset, offset + 16);
    const roots = messageItems(
      await options.api('preview', { peers, snapshot }),
    ).items;
    const related = messageItems(
      await options.api('relations', {
        ids: roots.map((row) => row.id),
        snapshot,
      }),
      48,
    ).items;
    const views = await options.read(snapshot, [...roots, ...related]);
    const delivered = await readDelivery({ api: options.api, snapshot, views });
    const own = delivered
      .filter((row) => row.own && !row.relation)
      .map((row) => row.id);
    const receipts = own.length
      ? await options.api('daily-receipts', { ids: own })
      : [];
    if (!Array.isArray(receipts) || receipts.length > 16)
      throw new Error('Confirmações inválidas.');
    const read = new Set<unknown>(receipts);
    options.guard();
    for (const row of dailyViews(delivered)) {
      if (!peers.includes(row.peer)) throw new Error('Mensagem de outro par.');
      result.set(
        row.peer,
        conversationPreview({
          ...row,
          displayText: row.content.text,
          read: read.has(row.id),
        }),
      );
    }
  }
  await options.api('confirm', { snapshot });
  options.guard();
  return result;
}
