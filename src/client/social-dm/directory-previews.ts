import { conversationPreview } from '../conversation-preview/index.ts';
import type { ConversationPreview } from '../conversation-preview/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';
type PreviewMessage = Extract<BackupRecord, { type: 'dm-message' }> & {
  displayText: string;
};

/** Uses the synchronized encrypted history and queries outgoing receipt status
 * in a batch. Merely showing a directory never marks an incoming message read. */
export async function readDmDirectoryPreviews(options: {
  peers: readonly string[];
  cached: (
    peer: string,
    before: number | null,
  ) => Promise<{ items: PreviewMessage[] }>;
  states: (
    own: string[],
  ) => Promise<{ id: string; received: boolean; read: boolean }[]>;
  guard: () => void;
}): Promise<Map<string, ConversationPreview>> {
  const result = new Map<string, ConversationPreview>();
  for (let offset = 0; offset < options.peers.length; offset += 16) {
    const rows: PreviewMessage[] = [];
    for (const peer of options.peers.slice(offset, offset + 16)) {
      options.guard();
      const page = await options.cached(peer, null),
        row = page.items.at(-1);
      if (row) rows.push(row);
    }
    const states = new Map(
      (
        await options.states(rows.filter((row) => row.own).map((row) => row.id))
      ).map((row) => [row.id, row]),
    );
    options.guard();
    for (const row of rows) {
      const state = states.get(row.id);
      result.set(
        row.peer.id,
        conversationPreview({
          ...row,
          ...(state
            ? {
                delivery: state.received
                  ? ('received' as const)
                  : ('accepted' as const),
                read: state.read,
              }
            : {}),
        }),
      );
    }
  }
  return result;
}
