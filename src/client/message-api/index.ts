import { AccountError, object } from '../../shared/account/index.ts';
import { messageBody } from '../../shared/messages/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
export async function messageApi(
  authority: VaultAuthority,
  operation: string,
  payload: Record<string, unknown>,
  guard: () => void,
): Promise<unknown> {
  guard();
  const options = await prepareMessageRequest(authority, operation, payload);
  guard();
  const response = await fetch(`/api/account/messages/${operation}`, {
    ...options,
    signal: AbortSignal.timeout(15000),
  });
  const data: unknown = await response.json();
  guard();
  if (!response.ok)
    throw new AccountError(
      response.status,
      String(object(data)['error']).slice(0, 200),
    );
  return data;
}
export async function prepareMessageRequest(
  authority: VaultAuthority,
  operation: string,
  payload: Record<string, unknown>,
): Promise<RequestInit> {
  const proof = {
    deviceId: authority.session.deviceId,
    directory: authority.directory,
    payload,
  };
  const signature = await authority.sign(
    messageBody(
      authority.session.accountId,
      authority.session.deviceId,
      operation,
      proof,
    ),
  );
  return {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      'X-Hash-Talk-CSRF': authority.session.csrf,
      ...(['attachment-part', 'dm-attachment-part'].includes(operation)
        ? { 'X-0xdmme-Attachment-Id': String(payload['id']) }
        : {}),
    },
    body: JSON.stringify({ ...proof, signature }),
  };
}

/** Export reads are repeatable; generation guards interrupt waits after logout/cancel. */
export async function backupMessageApi(
  a: VaultAuthority,
  op: string,
  payload: Record<string, unknown>,
  guard: () => void,
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await messageApi(a, op, payload, guard);
    } catch (error: unknown) {
      if (
        !(error instanceof AccountError) ||
        error.status !== 429 ||
        attempt >= 2
      )
        throw error;
      const until = Date.now() + 61_000;
      while (Date.now() < until) {
        guard();
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(1000, until - Date.now())),
        );
      }
      guard();
    }
  }
}
