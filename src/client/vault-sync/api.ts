import { fetchApi, readApiJson } from '../api-response/index.ts';
import { object } from '../../shared/account/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';

export async function vaultApi(
  authority: VaultAuthority,
  path: string,
  input: unknown,
): Promise<unknown> {
  if (authority.offline)
    throw new Error(
      'Cópia local apenas. Entre e confira a autorização para sincronizar com o servidor.',
    );
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Hash-Talk-CSRF': authority.session.csrf,
  };
  if (path === 'upload')
    headers['X-0xdmme-Vault-Id'] = String(
      object(object(input)['commit'])['id'],
    );
  const response = await fetchApi(
    `vault/${path}`,
    `/api/account/vault/${path}`,
    {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(8000),
    },
  );
  return readApiJson(response, `vault/${path}`);
}
