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
      ...(operation === 'attachment-part'
        ? { 'X-0xdmme-Attachment-Id': String(payload['id']) }
        : {}),
    },
    body: JSON.stringify({ ...proof, signature }),
  };
}
