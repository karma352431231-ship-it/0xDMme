import { AccountError, encode, object } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  claimableHandle,
  ownPublicProfile,
  publicProfileBody,
} from '../../shared/public-profile/index.ts';
import type { OwnPublicProfile } from '../../shared/public-profile/index.ts';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';

export class PublicProfiles {
  private readonly access: VaultAccess;
  private session: AccountSession | null = null;
  private generation = 0;
  profile: OwnPublicProfile | null = null;
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
    this.profile = null;
    return true;
  }
  async request(
    operation: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.session)
      throw new Error(
        'Conecte e autorize seu aparelho para gerenciar o perfil público.',
      );
    const generation = this.generation;
    await this.access.withVault(false, async (authority) => {
      if (
        authority.session.accountId !== this.session?.accountId ||
        authority.session.deviceId !== this.session.deviceId ||
        generation !== this.generation
      )
        throw new Error('Sessão alterada.');
      const proof = { directory: authority.directory, payload };
      const signature = await authority.sign(
        publicProfileBody(
          authority.session.accountId,
          authority.session.deviceId,
          operation,
          proof,
        ),
      );
      if (generation !== this.generation) throw new Error('Sessão alterada.');
      const response = await fetch(`/api/account/public-profile/${operation}`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          'X-Hash-Talk-CSRF': authority.session.csrf,
        },
        body: JSON.stringify({ ...proof, signature }),
        signal: AbortSignal.timeout(8000),
      });
      const data: unknown = await response.json();
      if (generation !== this.generation)
        throw new Error('Sessão alterada durante a operação.');
      if (!response.ok)
        throw new AccountError(
          response.status,
          String(object(data)['error']).slice(0, 200),
        );
      this.profile = ownPublicProfile(data);
    });
  }
  async refresh(): Promise<void> {
    await this.request('state', {});
  }
  async create(handle: string, consent: boolean): Promise<void> {
    if (!consent) throw new Error('Confirme a criação do perfil público.');
    await this.request('create', {
      handle: claimableHandle(handle),
      consent: true,
    });
  }
  async avatar(avatar: PendingPublicAvatar | null): Promise<void> {
    if (!this.profile) throw new Error('Crie seu perfil público primeiro.');
    await this.request('avatar', {
      revision: this.profile.revision,
      avatar: avatar
        ? { type: avatar.type, bytes: encode(avatar.bytes) }
        : null,
    });
  }
}
