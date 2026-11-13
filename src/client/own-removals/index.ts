/**
 * Author deletions started in this tab, per message, until a verified read of
 * their conversation settles them (owner, 13/11/2026). Deleting one message
 * removes only its bubble: the rest of the verified history stays mounted.
 *
 * It owns presentation state only. It never grants deletion authority, never
 * marks a window current and never advances a sync cursor: the server decides
 * the deletion and the existing verified read applies it.
 */
import { ApiResponseError } from '../api-response/index.ts';

/**
 * sending: the request is in flight and the bubble stays.
 * accepted: the server deleted it; the bubble is gone.
 * uncertain: the reply was lost; the next verified read decides.
 * settled: a verified read no longer has it; kept briefly for its echo.
 */
type Phase = 'sending' | 'accepted' | 'uncertain' | 'settled';

interface Target {
  scope: string;
  phase: Phase;
  settledAt: number;
}

/** At most this many targets wait at once, as in multi-select (64). */
const limit = 64;
/** The bare removal notice of a deletion can arrive after its verified read. */
const echoWindow = 10_000;

/**
 * How a failed deletion request ended. The server answering with a refusal
 * leaves the message; losing access conceals the conversation as before; any
 * other failure (network, timeout, cancellation) may have lost the reply after
 * the server deleted, so a verified read settles it before anything else.
 */
export function removalFailure(
  error: unknown,
): 'refused' | 'unauthorized' | 'uncertain' {
  if (!(error instanceof ApiResponseError) || error.failure !== 'http')
    return 'uncertain';
  return [401, 403, 410, 423].includes(error.status)
    ? 'unauthorized'
    : 'refused';
}

export class OwnRemovals {
  private readonly targets = new Map<string, Target>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }
  /** False for a repeated tap on a message already being deleted. */
  begin(scope: string, id: string): boolean {
    this.prune();
    if (this.targets.has(id)) return false;
    if (this.targets.size >= limit) {
      const settled = [...this.targets].find(
        ([, target]) => target.phase === 'settled',
      );
      if (!settled) return false;
      this.targets.delete(settled[0]);
    }
    this.targets.set(id, { scope, phase: 'sending', settledAt: 0 });
    return true;
  }
  /** The server accepted the deletion: its bubble leaves now. */
  accepted(id: string): void {
    const target = this.targets.get(id);
    if (target?.phase === 'sending') target.phase = 'accepted';
  }
  /**
   * A refusal leaves the message where it was. When the reply was lost, the
   * deletion may or may not have happened; the next verified read decides.
   */
  failed(id: string, uncertain: boolean): void {
    const target = this.targets.get(id);
    if (target?.phase !== 'sending') return;
    if (uncertain) target.phase = 'uncertain';
    else this.targets.delete(id);
  }
  /** Whether a bare removal notice may be this tab's own deletion arriving. */
  expecting(): boolean {
    this.prune();
    return this.targets.size > 0;
  }
  /**
   * Rows of an accepted deletion, and the edits, reactions and pins that
   * point at them, stay hidden, including from reads that began earlier.
   */
  visible<T extends { id: string; relation?: { id: string } | undefined }>(
    rows: readonly T[],
  ): T[] {
    return rows.filter(
      (row) =>
        !this.hides(row.id) && !(row.relation && this.hides(row.relation.id)),
    );
  }
  /**
   * A verified read of `scope` that completed settles its targets: accepted
   * ones once the read no longer has them; uncertain ones either way, since
   * the read shows whether the deletion happened. Requests still in flight
   * wait for their reply.
   */
  settle(scope: string, rows: readonly { id: string }[]): void {
    const shown = new Set(rows.map((row) => row.id));
    for (const [id, target] of this.targets) {
      if (target.scope !== scope) continue;
      if (target.phase === 'uncertain' && shown.has(id))
        this.targets.delete(id);
      else if (
        (target.phase === 'accepted' || target.phase === 'uncertain') &&
        !shown.has(id)
      ) {
        target.phase = 'settled';
        target.settledAt = this.now();
      }
    }
  }
  /** Whether a verified read showed this deletion done, even after a lost reply. */
  done(id: string): boolean {
    return this.targets.get(id)?.phase === 'settled';
  }
  clear(): void {
    this.targets.clear();
  }
  private hides(id: string): boolean {
    const phase = this.targets.get(id)?.phase;
    return phase === 'accepted' || phase === 'settled';
  }
  private prune(): void {
    const now = this.now();
    for (const [id, target] of this.targets)
      if (target.phase === 'settled' && now - target.settledAt > echoWindow)
        this.targets.delete(id);
  }
}
