import {
  isSyncSnapshot,
  sameSyncFence,
} from '../../shared/message-sync/index.ts';
/** Preserve an unfinished finite scan across ordinary arrival hints. */
export class MessageReadTarget {
  private current: unknown = null;
  reset(): void {
    this.current = null;
  }
  take(snapshot: unknown): unknown {
    if (
      isSyncSnapshot(snapshot) &&
      isSyncSnapshot(this.current) &&
      sameSyncFence(snapshot, this.current)
    )
      return this.current;
    this.current = snapshot;
    return snapshot;
  }
}
