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
  private phase: 'initial' | 'deferred' | 'ready' = 'initial';
  private readonly background: (session: AccountSession) => void;
  constructor(background: (session: AccountSession) => void) {
    this.background = background;
  }
  get deferred(): boolean {
    return this.phase === 'deferred';
  }
  get backgroundReady(): boolean {
    return this.session !== null && this.phase === 'ready';
  }
  setSession(session: AccountSession | null): void {
    if (!sameSession(this.session, session)) this.phase = 'initial';
    this.session = session ? { ...session } : null;
  }
  reset(): void {
    this.session = null;
    this.phase = 'initial';
  }
  update(
    session: AccountSession,
    options: { directoryStarting: boolean; prioritizeDirectory: boolean },
  ): void {
    this.setSession(session);
    if (this.deferred) {
      if (!options.prioritizeDirectory) this.settled(session);
      return;
    }
    if (options.directoryStarting && options.prioritizeDirectory) {
      this.phase = 'deferred';
      return;
    }
    this.phase = 'ready';
    this.background(session);
  }
  /** Called on publication or failure; failure never becomes directory success. */
  settled(session: AccountSession | null): void {
    if (!session || !this.deferred || !sameSession(this.session, session))
      return;
    this.phase = 'ready';
    this.background(this.session!);
  }
  release(): void {
    this.settled(this.session);
  }
}
