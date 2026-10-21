import { ApiResponseError } from '../api-response/index.ts';
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

/** Transport interruptions preserve verified prefixes, never authority failures,
 * cancellations or malformed responses. Every resumed request rechecks security. */
export function interruptedMessageRead(error: unknown): boolean {
  if (!(error instanceof ApiResponseError)) return false;
  if ([401, 403, 409].includes(error.status)) return false;
  if (error.failure === 'network' || error.failure === 'timeout') return true;
  return (
    error.failure === 'http' &&
    (error.status === 408 || error.status === 429 || error.status >= 500)
  );
}

/** V2 distinguishes append from destructive change; legacy reads retain their
 * existing live-notice/final-confirmation policy. */
export function retainsMessageReadFence(
  from: unknown,
  snapshot: unknown,
): boolean {
  if (!isSyncSnapshot(from) && !isSyncSnapshot(snapshot)) return true;
  return (
    isSyncSnapshot(from) &&
    isSyncSnapshot(snapshot) &&
    sameSyncFence(from, snapshot)
  );
}
