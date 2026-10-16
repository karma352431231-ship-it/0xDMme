import { fetchApi, readApiJson } from '../api-response/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  community,
  communityPage,
  communityState,
} from '../../shared/communities/index.ts';
import type {
  CommunityPage,
  CommunityState,
} from '../../shared/communities/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { signedCommunityRequest } from './signed-request.ts';
import type { CommunitySigner } from './signed-request.ts';
import { MediaPartAuthority } from './media-part-authority.ts';

export async function communityRead(
  path: string,
  signal: AbortSignal,
): Promise<unknown> {
  return readApiJson(
    await fetchApi('communities/read', path, {
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal,
    }),
    'communities/read',
  );
}
export async function readCommunity(id: string, signal: AbortSignal) {
  return community(
    await readApiJson(
      await fetchApi(
        'communities/read',
        `/api/communities/${/^[a-f0-9-]{36}$/u.test(id) ? '' : 'address/'}${encodeURIComponent(id)}`,
        {
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          signal,
        },
      ),
      'communities/read',
    ),
  );
}
export class Communities {
  private readonly access: VaultAccess;
  private readonly parts: MediaPartAuthority;
  private session: AccountSession | null = null;
  private generation = 0;
  constructor(access: VaultAccess) {
    this.access = access;
    this.parts = new MediaPartAuthority(access);
  }
  setSession(session: AccountSession | null): boolean {
    if (
      session?.csrf === this.session?.csrf &&
      session?.accountId === this.session?.accountId &&
      session?.deviceId === this.session?.deviceId
    )
      return false;
    this.parts.clear();
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
    const send = (authority: CommunitySigner) =>
      signedCommunityRequest({
        operation,
        payload,
        authority,
        valid: () =>
          authority.session.accountId === this.session?.accountId &&
          authority.session.deviceId === this.session.deviceId &&
          authority.session.csrf === this.session.csrf &&
          generation === this.generation,
      });
    if (operation !== 'media-part') return this.access.withVault(false, send);
    try {
      return await send(await this.parts.get());
    } catch (error: unknown) {
      this.parts.clear();
      throw error;
    }
  }

  async state(id: string): Promise<CommunityState> {
    return communityState(await this.request('state', { id }));
  }
  async list(kind: string, after: string | null): Promise<CommunityPage> {
    return communityPage(await this.request('list', { kind, after }));
  }
}
