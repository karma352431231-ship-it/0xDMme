import type { AccountSession } from '../../shared/account/index.ts';

/** Account rechecks are independent of entering a chat or reconnecting SSE.
 * Notify messages once per authorized session, even when opening the private
 * profile calls connection() several times during the same recheck. */
export class MessageReadiness {
  private current: Pick<
    AccountSession,
    'accountId' | 'deviceId' | 'csrf'
  > | null = null;
  update(session: AccountSession | null, authorized: boolean): boolean {
    if (!session || !authorized) {
      this.current = null;
      return false;
    }
    const previous = this.current;
    this.current = {
      accountId: session.accountId,
      deviceId: session.deviceId,
      csrf: session.csrf,
    };
    return (
      previous?.accountId !== session.accountId ||
      previous.deviceId !== session.deviceId ||
      previous.csrf !== session.csrf
    );
  }
}
