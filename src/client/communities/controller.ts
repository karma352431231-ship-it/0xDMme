import { AccountError, object } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  community,
  communityBody,
  communityPage,
  communityState,
} from '../../shared/communities/index.ts';
import type {
  CommunityPage,
  CommunityState,
} from '../../shared/communities/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';

async function responseData(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok)
    throw new AccountError(
      response.status,
      String(object(data)['error']).slice(0, 200),
    );
  return data;
}
export async function communityRead(
  path: string,
  signal: AbortSignal,
): Promise<unknown> {
  return responseData(
    await fetch(path, {
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal,
    }),
  );
}
export async function readCommunity(id: string, signal: AbortSignal) {
  return community(
    await responseData(
      await fetch(`/api/communities/${encodeURIComponent(id)}`, {
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal,
      }),
    ),
  );
}
export class Communities {
  private readonly access: VaultAccess;
  private session: AccountSession | null = null;
  private generation = 0;
  constructor(access: VaultAccess) {
    this.access = access;
  }
  setSession(session: AccountSession | null): boolean {
    if (
      session?.csrf === this.session?.csrf &&
      session?.accountId === this.session?.accountId
    )
      return false;
    this.generation++;
    this.session = session;
    return true;
  }
  async request(
    operation: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const generation = this.generation;
    if (!this.session)
      throw new Error(
        'Entre e crie seu perfil público em Perfil para participar.',
      );
    return this.access.withVault(false, async (authority) => {
      if (
        authority.session.accountId !== this.session?.accountId ||
        authority.session.deviceId !== this.session.deviceId ||
        generation !== this.generation
      )
        throw new Error('Sessão alterada.');
      const proof = { directory: authority.directory, payload };
      const signature = await authority.sign(
        communityBody(
          authority.session.accountId,
          authority.session.deviceId,
          operation,
          proof,
        ),
      );
      if (generation !== this.generation) throw new Error('Sessão alterada.');
      const response = await fetch(`/api/account/communities/${operation}`, {
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
      });
      const result = await responseData(response);
      if (generation !== this.generation)
        throw new Error('Sessão alterada durante a operação.');
      return result;
    });
  }
  async state(id: string): Promise<CommunityState> {
    return communityState(await this.request('state', { id }));
  }
  async list(kind: string, after: string | null): Promise<CommunityPage> {
    return communityPage(await this.request('list', { kind, after }));
  }
}
