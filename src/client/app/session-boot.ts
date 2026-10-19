import type { AccountSession } from '../../shared/account/index.ts';

function sameSession(
  left: AccountSession | null,
  right: AccountSession | null,
): boolean {
  return (
    left?.accountId === right?.accountId &&
    left?.deviceId === right?.deviceId &&
    left?.csrf === right?.csrf
  );
}

/** Coalesce optional startup work while the foreground directory is loading.
 * This schedules work only; every operation keeps its existing authority checks. */
export class SessionBoot {
  private session: AccountSession | null = null;
  private pending = false;
  private readonly background: (session: AccountSession) => void;
  constructor(background: (session: AccountSession) => void) {
    this.background = background;
  }
  get deferred(): boolean {
    return this.pending;
  }
  setSession(session: AccountSession | null): void {
    if (!sameSession(this.session, session)) this.pending = false;
    this.session = session ? { ...session } : null;
  }
  reset(): void {
    this.session = null;
    this.pending = false;
  }
  update(
    session: AccountSession,
    options: { directoryStarting: boolean; prioritizeDirectory: boolean },
  ): void {
    this.setSession(session);
    if (this.pending) {
      if (!options.prioritizeDirectory) this.settled(session);
      return;
    }
    if (options.directoryStarting && options.prioritizeDirectory) {
      this.pending = true;
      return;
    }
    this.background(session);
  }
  /** Called on publication or failure; failure never becomes directory success. */
  settled(session: AccountSession | null): void {
    if (!session || !this.pending || !sameSession(this.session, session))
      return;
    this.pending = false;
    this.background(this.session!);
  }
  release(): void {
    this.settled(this.session);
  }
}
