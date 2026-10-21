import { AccountError } from '../../shared/account/index.ts';
/** Explicit lifecycle interruptions. A plain AbortError is never an expected yield. */
export type InterruptionOrigin =
  | 'navigation'
  | 'replacement'
  | 'continuation'
  | 'scheduler'
  | 'session'
  | 'authorization'
  | 'removal';
export class WorkInterruption extends Error {
  readonly origin: InterruptionOrigin;
  constructor(origin: InterruptionOrigin) {
    super(
      origin === 'session'
        ? 'Session changed.'
        : 'Synchronization work interrupted.',
    );
    this.name = 'WorkInterruption';
    this.origin = origin;
  }
  get expected(): boolean {
    return ['navigation', 'replacement', 'continuation', 'scheduler'].includes(
      this.origin,
    );
  }
}
export function workInterruption(error: unknown): WorkInterruption | null {
  for (let depth = 0; depth < 4 && error instanceof Error; depth++) {
    if (error instanceof WorkInterruption) return error;
    error = error.cause;
  }
  return null;
}
export function expectedInterruption(error: unknown): boolean {
  return workInterruption(error)?.expected === true;
}
/** Selection work has its own lifetime; changing it never ends the account owner. */
export class SelectionWork {
  private generation = 0;
  private origin: InterruptionOrigin = 'navigation';
  invalidate(origin: InterruptionOrigin = 'navigation'): void {
    this.origin = origin;
    this.generation++;
  }
  capture(account: () => void): () => void {
    const generation = this.generation;
    return () => {
      account();
      if (generation !== this.generation)
        throw new WorkInterruption(this.origin);
    };
  }
}

/** A stale selection must not clear a newer projection. Security denials still
 * invalidate account-wide access, even if their original screen has changed. */
export function guardProjectionFailure(
  error: unknown,
  guard: () => void,
  denied?: () => void,
): void {
  if (error instanceof AccountError && [401, 403, 409].includes(error.status)) {
    denied?.();
    return;
  }
  guard();
}

export { MessageContinuation } from './continuation.ts';
export type { MessageWork, MessageWorkResult } from './continuation.ts';
