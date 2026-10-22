import { measureWork } from '../synchronization-diagnostics/index.ts';
import { t } from '../../shared/i18n/index.ts';

/** Whether an operation runs after another one inside the same native turn. */
export interface AuthorityTurnContext {
  follower: boolean;
}
type NativeTurn = (
  key: string,
  body: () => Promise<void>,
  options: { waitMs: number; priority?: 'interactive' },
) => Promise<void>;

interface WaitingWork {
  interactive: boolean;
  /** Plain work acquires its own native turn. */
  run: () => Promise<void>;
  /** Held work runs inside a turn this queue acquires; it settles its caller
   * and reports whether a follower may still use the same turn. */
  held?: {
    key: string;
    operation: (context: AuthorityTurnContext) => Promise<boolean>;
    fail: (error: unknown) => void;
    remaining: () => number;
  };
}

// A turn's leader already read the device directory; operations that were
// waiting may follow it while that read is recent. The server still checks the
// session, the signed directory and this device on every request.
const followersPerTurn = 3;
const followerWindowMs = 1000;

/** Submit only one native lock request at a time from this controller, so
 * interactive reads can precede queued maintenance. Four interactive turns
 * give way to one maintenance turn. Native cross-tab exclusivity remains intact.
 * At most 64 waiting operations; the existing 8s acquisition budget includes
 * time in this queue and time waiting for the native lock. Held work of the
 * same account and priority that is already waiting may share a turn, bounded
 * by three followers and one second; any failure ends that turn's batch. */
export class AuthorityWork {
  private readonly waiting: WaitingWork[] = [];
  private running = false;
  private interactiveTurns = 0;
  private readonly turn: NativeTurn | null;
  constructor(turn: NativeTurn | null = null) {
    this.turn = turn;
  }

  run<T>(
    work: (waitMs: number) => Promise<T>,
    priority?: 'interactive',
  ): Promise<T> {
    return this.enqueue(priority, (entry, settle) => {
      entry.run = async () => {
        await settle((remaining) => work(Math.min(8000, remaining)));
      };
    });
  }
  /** Runs inside a native turn acquired here, possibly after another held
   * operation of the same key and priority that is already running. */
  hold<T>(
    key: string,
    operation: (context: AuthorityTurnContext) => Promise<T>,
    priority?: 'interactive',
  ): Promise<T> {
    const turn = this.turn;
    if (!turn) return Promise.reject(new Error('Authority turn unavailable.'));
    return this.enqueue(priority, (entry, settle, fail, remaining) => {
      const held = {
        key,
        operation: (context: AuthorityTurnContext) =>
          settle(() => operation(context)),
        fail,
        remaining,
      };
      entry.held = held;
      entry.run = () => this.lead(entry, held, turn);
    });
  }
  private enqueue<T>(
    priority: 'interactive' | undefined,
    prepare: (
      entry: WaitingWork,
      settle: (run: (remaining: number) => Promise<T>) => Promise<boolean>,
      fail: (error: unknown) => void,
      remaining: () => number,
    ) => void,
  ): Promise<T> {
    if (this.waiting.length >= 64)
      return Promise.reject(
        new Error('Wait for conversations to update, then try again.'),
      );
    const queuedAt = performance.now();
    const deadline = queuedAt + 8000;
    return new Promise<T>((resolve, reject) => {
      const timeout = () =>
        new DOMException(
          t('Wait for conversations to update, then try again.'),
          'TimeoutError',
        );
      const fail = (error: unknown) =>
        reject(
          error instanceof Error
            ? error
            : new Error('Could not complete the operation.'),
        );
      const remaining = () => Math.ceil(deadline - performance.now());
      const settle = async (
        run: (remaining: number) => Promise<T>,
      ): Promise<boolean> => {
        clearTimeout(timer);
        const left = remaining();
        if (left <= 0) {
          reject(timeout());
          return false;
        }
        try {
          resolve(
            await measureWork(
              this,
              'authority-queue',
              () => run(left),
              queuedAt,
            ),
          );
          return true;
        } catch (error: unknown) {
          fail(error);
          return false;
        }
      };
      const entry: WaitingWork = {
        interactive: priority === 'interactive',
        run: () => Promise.resolve(),
      };
      prepare(entry, settle, fail, remaining);
      const timer = setTimeout(() => {
        const index = this.waiting.indexOf(entry);
        if (index < 0) return;
        this.waiting.splice(index, 1);
        reject(timeout());
      }, 8000);
      this.waiting.push(entry);
      this.resume();
    });
  }
  private async lead(
    entry: WaitingWork,
    held: NonNullable<WaitingWork['held']>,
    turn: NativeTurn,
  ): Promise<void> {
    const waitMs = Math.min(8000, held.remaining());
    if (waitMs <= 0) {
      await held.operation({ follower: false });
      return;
    }
    try {
      await turn(held.key, () => this.batch(entry, held), {
        waitMs,
        ...(entry.interactive ? { priority: 'interactive' as const } : {}),
      });
    } catch (error: unknown) {
      // Only an unacquired turn reaches here; settled callers ignore it.
      held.fail(error);
    }
  }
  private async batch(
    leader: WaitingWork,
    held: NonNullable<WaitingWork['held']>,
  ): Promise<void> {
    const started = performance.now();
    let usable = await held.operation({ follower: false });
    for (
      let count = 0;
      usable &&
      count < followersPerTurn &&
      performance.now() - started < followerWindowMs;
      count++
    ) {
      const index = this.follower(leader, held.key);
      if (index < 0) return;
      const [next] = this.waiting.splice(index, 1);
      if (next!.interactive) this.interactiveTurns++;
      usable = await next!.held!.operation({ follower: true });
    }
  }
  /** Maintenance never holds back waiting interactive work, and interactive
   * batches keep the existing four-to-one maintenance share. */
  private follower(leader: WaitingWork, key: string): number {
    const background = this.waiting.some((work) => !work.interactive);
    if (leader.interactive && background && this.interactiveTurns >= 4)
      return -1;
    if (!leader.interactive && this.waiting.some((work) => work.interactive))
      return -1;
    return this.waiting.findIndex(
      (work) =>
        work.held?.key === key && work.interactive === leader.interactive,
    );
  }
  private resume(): void {
    if (this.running) return;
    if (!this.waiting.length) {
      this.interactiveTurns = 0;
      return;
    }
    const index = this.next();
    const [entry] = this.waiting.splice(index, 1);
    this.running = true;
    void entry!.run().finally(() => {
      this.running = false;
      this.resume();
    });
  }
  private next(): number {
    const background = this.waiting.findIndex((work) => !work.interactive);
    const interactive = this.waiting.findIndex((work) => work.interactive);
    if (background >= 0 && this.interactiveTurns >= 4) {
      this.interactiveTurns = 0;
      return background;
    }
    if (interactive >= 0) {
      this.interactiveTurns++;
      return interactive;
    }
    this.interactiveTurns = 0;
    return 0;
  }
}
