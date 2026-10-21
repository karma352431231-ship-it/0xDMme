import type { AccountSession } from '../../shared/account/index.ts';
export type LiveSession = Pick<
  AccountSession,
  'accountId' | 'deviceId' | 'csrf'
>;
export function sameLiveSession(
  left: LiveSession,
  right: LiveSession,
): boolean {
  return (
    left.accountId === right.accountId &&
    left.deviceId === right.deviceId &&
    left.csrf === right.csrf
  );
}
/** Credentials never appear in channel names or messages; only this domain-separated digest does. */
export async function liveScope(session: LiveSession): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify([
      '0xdmme-live-2',
      session.accountId,
      session.deviceId,
      session.csrf,
    ]),
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return (
    '0xdmme-live-2:' +
    Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
  );
}
