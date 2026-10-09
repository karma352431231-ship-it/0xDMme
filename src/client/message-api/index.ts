import { fetchApi, readApiJson } from '../api-response/index.ts';
import { AccountError } from '../../shared/account/index.ts';
import { messageBody } from '../../shared/messages/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
export async function messageApi(
  authority: VaultAuthority,
  operation: string,
  payload: Record<string, unknown>,
  control: (() => void) | { guard: () => void; signal: AbortSignal },
): Promise<unknown> {
  const guard = typeof control === 'function' ? control : control.guard;
  const timeout = AbortSignal.timeout(15000);
  const signal =
    typeof control === 'function'
      ? timeout
      : AbortSignal.any([timeout, control.signal]);
  guard();
  const options = await prepareMessageRequest(authority, operation, payload);
  guard();
  const response = await fetchApi(
    `messages/${operation}`,
    `/api/account/messages/${operation}`,
    {
      ...options,
      signal,
    },
  );
  const data = await readApiJson(response, `messages/${operation}`);
  guard();
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
