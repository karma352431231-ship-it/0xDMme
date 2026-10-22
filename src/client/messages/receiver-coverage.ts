import {
  isSyncSnapshot,
  sameSyncFence,
} from '../../shared/message-sync/index.ts';
import type { MessageSyncSnapshot } from '../../shared/message-sync/index.ts';

/** Whether the account receiver will apply a later snapshot found by the open
 * window's probe. Only an append-only advance qualifies, and only while the
 * receiver's last completed cut is not past the window; its next journal cut
 * then starts at or before the window and covers it. A removal or authority
 * change keeps the selected recovery read. */
export function receiverOwnsAdvance(input: {
  window: string;
  probed: unknown;
  receiver: MessageSyncSnapshot | null;
}): boolean {
  const window = JSON.parse(input.window) as unknown;
  return (
    isSyncSnapshot(window) &&
    isSyncSnapshot(input.probed) &&
    sameSyncFence(window, input.probed) &&
    (input.receiver === null || input.receiver.revision <= window.revision)
  );
}

/** The durable checkpoint, shared by every tab of this device, passed the cut
 * this tab last committed or observed: another tab applied those changes and
 * this tab's projections did not receive them. */
export function advancedElsewhere(
  own: MessageSyncSnapshot | null,
  durable: MessageSyncSnapshot | null,
): boolean {
  return own !== null && durable !== null && durable.revision > own.revision;
}

/** A completed receiver cut passed the open window without covering it, so
 * later cuts cannot cover it either until the window is read again. */
export function windowBehind(
  window: string,
  cut: MessageSyncSnapshot,
): boolean {
  const snapshot = JSON.parse(window) as unknown;
  return isSyncSnapshot(snapshot) && snapshot.revision < cut.revision;
}
