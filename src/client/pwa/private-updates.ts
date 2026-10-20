import type { PrivateNotificationDetail } from '../notification-private/index.ts';
import { privatePushCandidates } from '../../shared/private-notification/index.ts';
type Candidate = PrivateNotificationDetail['candidate'];
interface DetailRequest {
  candidates: Candidate[];
  scope: string;
}
interface DetailPorts {
  read: (
    input: DetailRequest & { signal: AbortSignal },
  ) => Promise<PrivateNotificationDetail[]>;
  inspect: () => Promise<object | null>;
  show: (detail: PrivateNotificationDetail) => Promise<void>;
}
/** One active read and one replaceable followup. New alerts cancel old detail
 * work without waiting for an SDK/store/network request to release its lock. */
export class PrivateDetailUpdates {
  private readonly ports: DetailPorts;
  private active: Promise<void> | null = null;
  private pending: DetailRequest | null = null;
  private abort: AbortController | null = null;
  constructor(ports: DetailPorts) {
    this.ports = ports;
  }
  cancel(): void {
    this.pending = null;
    this.abort?.abort();
  }
  request(input: DetailRequest): void {
    this.cancel();
    this.pending = input;
    this.active ??= this.drain();
  }
  wait(): Promise<void> {
    return this.active ?? Promise.resolve();
  }
  private async drain(): Promise<void> {
    try {
      while (this.pending) {
        const input = this.pending;
        this.pending = null;
        await this.update(input);
      }
    } finally {
      this.active = null;
    }
  }
  private async update(input: DetailRequest): Promise<void> {
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 8000);
    this.abort = abort;
    try {
      const details = await this.ports.read({ ...input, signal: abort.signal });
      abort.signal.throwIfAborted();
      const current = await this.ports.inspect();
      abort.signal.throwIfAborted();
      if (
        !current ||
        !('publicScope' in current) ||
        current.publicScope !== input.scope ||
        !('privateCandidates' in current)
      )
        return;
      const candidates = privatePushCandidates(current.privateCandidates);
      for (const detail of details) {
        abort.signal.throwIfAborted();
        if (
          candidates.some((candidate) =>
            sameCandidate(candidate, detail.candidate),
          )
        )
          await this.ports.show(detail);
      }
    } catch {
      // Missing keys, changed authority, timeout or preemption keep only the
      // prompt generic alert. Cleartext never enters caches, logs or a request.
    } finally {
      clearTimeout(timer);
      abort.abort();
      if (this.abort === abort) this.abort = null;
    }
  }
}
function sameCandidate(a: Candidate, b: Candidate): boolean {
  if (a.kind !== b.kind || a.id !== b.id) return false;
  return a.kind === 'direct'
    ? b.kind === 'direct' && a.peer === b.peer
    : b.kind === 'group' && a.group === b.group;
}
