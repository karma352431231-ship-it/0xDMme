import type { AccountSession } from '../../shared/account/index.ts';

/** Longest delay a single browser timer accepts (about 24.8 days). */
const longestTimer = 2_147_483_647;

export interface SessionDeadline {
  /** Starts tracking this session, replacing any previous one. */
  track: (session: AccountSession) => void;
  stop: () => void;
}

/**
 * Owns the timer that ends a signed-in page at its session deadline. The
 * server extends a session each time it is restored, so every timer wake-up
 * re-reads the session and adopts a later deadline. A page left open therefore
 * stays signed in; it ends only when the server stops extending the session.
 * A failed or mismatched re-read keeps the deadline already known.
 */
export function createSessionDeadline(input: {
  /** Re-reads the current session; rejects or resolves null when unavailable. */
  refresh: () => Promise<AccountSession | null>;
  extended: (expiresAt: string) => void;
  expired: () => void;
}): SessionDeadline {
  let timer: number | undefined;
  let tracked: AccountSession | null = null;
  let generation = 0;

  function schedule(): void {
    window.clearTimeout(timer);
    const session = tracked;
    if (!session) return;
    const remaining = Math.max(0, Date.parse(session.expiresAt) - Date.now());
    timer = window.setTimeout(wake, Math.min(remaining, longestTimer));
  }
  function wake(): void {
    const session = tracked;
    if (!session) return;
    if (Date.parse(session.expiresAt) <= Date.now()) {
      stop();
      input.expired();
      return;
    }
    schedule();
    void extend(session, generation);
  }
  async function extend(
    session: AccountSession,
    current: number,
  ): Promise<void> {
    let latest: AccountSession | null;
    try {
      latest = await input.refresh();
    } catch {
      return;
    }
    if (
      current !== generation ||
      !latest ||
      latest.csrf !== session.csrf ||
      Date.parse(latest.expiresAt) <= Date.parse(session.expiresAt)
    )
      return;
    tracked = { ...session, expiresAt: latest.expiresAt };
    input.extended(latest.expiresAt);
    schedule();
  }
  function stop(): void {
    generation++;
    tracked = null;
    window.clearTimeout(timer);
  }
  return {
    track(session) {
      generation++;
      tracked = session;
      schedule();
    },
    stop,
  };
}
