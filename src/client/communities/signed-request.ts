import { fetchApi, readApiJson } from '../api-response/index.ts';
import { communityBody } from '../../shared/communities/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';

export type CommunitySigner = Pick<
  VaultAuthority,
  'session' | 'directory' | 'sign'
>;

export async function signedCommunityRequest(options: {
  operation: string;
  payload: Record<string, unknown>;
  authority: CommunitySigner;
  valid: () => boolean;
}): Promise<unknown> {
  const { operation, payload, authority, valid } = options;
  function assertCurrent(): void {
    if (!valid()) throw new Error('Sessão alterada.');
  }
  assertCurrent();
  const proof = { directory: authority.directory, payload };
  const signature = await authority.sign(
    communityBody(
      authority.session.accountId,
      authority.session.deviceId,
      operation,
      proof,
    ),
  );
  assertCurrent();
  const response = await fetchApi(
    `communities/${operation}`,
    `/api/account/communities/${operation}`,
    {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Hash-Talk-CSRF': authority.session.csrf,
      },
      body: JSON.stringify({ ...proof, signature }),
      signal: AbortSignal.timeout(
        operation.startsWith('media-') ? 15000 : 8000,
      ),
    },
  );
  const result = await readApiJson(response, `communities/${operation}`);
  assertCurrent();
  return result;
}
