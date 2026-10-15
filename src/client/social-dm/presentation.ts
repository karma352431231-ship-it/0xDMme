import type { BackupRecord } from '../backup-records/index.ts';
import { dailyViews } from '../daily-text/index.ts';
type Record = Extract<BackupRecord, { type: 'dm-message' }>;
export function projectDmMessages(
  roots: readonly Record[],
  actions: readonly Record[],
) {
  const originals = new Map(roots.map((row) => [row.id, row]));
  return dailyViews(
    [...roots, ...actions].map((row) => ({
      ...row,
      peer: row.peer.id,
      author: row.own ? row.self : row.peer.id,
    })),
  ).map((view) => ({
    ...originals.get(view.id)!,
    sender: view.author,
    reactions: view.reactions,
    ownReaction: view.ownReaction,
    displayText: view.content.text,
  }));
}
