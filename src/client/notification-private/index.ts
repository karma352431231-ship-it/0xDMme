import { accountSession, encode } from '../../shared/account/index.ts';
import { digest } from '../../shared/devices/index.ts';
import type { PrivatePushCandidate } from '../../shared/private-notification/index.ts';
import { fetchApi, readApiJson } from '../api-response/index.ts';
import { BackgroundVaultAccess } from '../devices/index.ts';
import { VaultSync } from '../vault-sync/index.ts';
import { notificationMessages } from '../messages/index.ts';
import { readGroupNotification } from '../groups/index.ts';

export interface PrivateNotificationDetail {
  candidate: PrivatePushCandidate;
  title: string;
  body: string;
  icon?: string;
}
/** All decrypted data remains in this worker's RAM until handed to the OS.
 * The isolated push sender and backend never receive text or private photos. */
export async function privateNotificationDetails(input: {
  candidates: PrivatePushCandidate[];
  scope: string;
  signal: AbortSignal;
}): Promise<PrivateNotificationDetail[]> {
  const response = await fetchApi('account/session', '/api/account/session', {
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    signal: input.signal,
  });
  const session = accountSession(
    await readApiJson(response, 'account/session'),
  );
  if ((await digest(session.csrf)) !== input.scope)
    throw new Error('Push session changed.');
  input.signal.throwIfAborted();
  const access = new BackgroundVaultAccess(session, input.signal),
    sync = new VaultSync(access);
  sync.setSession(session);
  const messages = notificationMessages({ ...input, session, access, sync });
  const details: PrivateNotificationDetail[] = [];
  try {
    for (const candidate of input.candidates) {
      input.signal.throwIfAborted();
      const detail = await availableDetail(
        { ...input, session, access, sync, messages },
        candidate,
      );
      if (detail) details.push(detail);
    }
    return details;
  } finally {
    messages.close();
    sync.setSession(null);
    access.close();
  }
}
type DetailContext = {
  session: ReturnType<typeof accountSession>;
  access: BackgroundVaultAccess;
  sync: VaultSync;
  messages: ReturnType<typeof notificationMessages>;
  signal: AbortSignal;
};
async function availableDetail(
  c: DetailContext,
  candidate: PrivatePushCandidate,
): Promise<PrivateNotificationDetail | null> {
  try {
    return await readDetail(c, candidate);
  } catch {
    c.signal.throwIfAborted();
    return null;
  }
}
async function readDetail(
  c: DetailContext,
  candidate: PrivatePushCandidate,
): Promise<PrivateNotificationDetail | null> {
  if (candidate.kind === 'group') {
    const group = await readGroupNotification({
      ...c,
      group: candidate.group,
      id: candidate.id,
    });
    if (!group) return null;
    const profile = await c.messages.profile(group.sender);
    return {
      candidate,
      title: group.title,
      body: profile?.name ? `${profile.name}: ${group.text}` : group.text,
      ...photoIcon(profile?.photo),
    };
  }
  const body = await c.messages.read(candidate.peer, candidate.id);
  if (body === null) return null;
  const profile = await c.messages.profile(candidate.peer);
  return {
    candidate,
    title: profile?.name || '0xDMme',
    body,
    ...photoIcon(profile?.photo),
  };
}
function photoIcon(
  photo: { type: string; bytes: Uint8Array } | null | undefined,
): { icon?: string } {
  // Large full-resolution profile photos must not hold up the OS alert.
  return photo && photo.bytes.length <= 128_000
    ? { icon: `data:${photo.type};base64,${encode(photo.bytes)}` }
    : {};
}
