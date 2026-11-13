import { decodeDailyText } from '../../shared/daily/index.ts';
import { readReopen, writeReopen } from '../reopen-cache/index.ts';
import { isSyncSnapshot } from '../../shared/message-sync/index.ts';
import {
  projectCachedConversation,
  retainedMessageView,
} from './cache-projection.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import type { MessageView } from './message-view.ts';
interface Checkpoint {
  snapshot: string;
  views: MessageView[];
}
function location(a: VaultAuthority, peer: string) {
  return {
    scope: a.session.accountId,
    name: `reopen:direct:${peer}`,
    binding: peer,
  };
}
/** A bounded completed recent projection, never an entire history or a live
 * presentation permit. The reader must bridge/confirm its cut before display. */
export async function loadConversationCheckpoint(
  a: VaultAuthority,
  peer: string | null,
): Promise<Checkpoint | null> {
  if (!peer) return null;
  const value = await readReopen<Checkpoint>(a, location(a, peer));
  try {
    return validCheckpoint(a, peer, value) ? value : null;
  } catch {
    return null;
  }
}
function validCheckpoint(
  a: VaultAuthority,
  peer: string,
  value: Checkpoint | null,
): boolean {
  if (
    !value ||
    !Array.isArray(value.views) ||
    value.views.length > 66 ||
    value.views.some((view) => view.peer !== peer)
  )
    return false;
  const snapshot: unknown = JSON.parse(value.snapshot);
  return (
    isSyncSnapshot(snapshot) &&
    snapshot.account === a.session.accountId &&
    snapshot.device === a.session.deviceId &&
    snapshot.directory === a.directory
  );
}
export async function saveConversationCheckpoint(
  a: VaultAuthority,
  peer: string,
  candidate: Checkpoint,
): Promise<void> {
  const snapshot: unknown = JSON.parse(candidate.snapshot);
  if (!isSyncSnapshot(snapshot)) return;
  if (
    candidate.views.some(
      (view) => view.kind === 'text' && decodeDailyText(view.text).viewOnce,
    )
  )
    return;
  const views = projectCachedConversation(candidate.views, [], [], null).map(
    retainedMessageView,
  );
  await writeReopen(a, location(a, peer), {
    snapshot: candidate.snapshot,
    views,
  });
}
