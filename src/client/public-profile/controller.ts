import { fetchApi, readApiJson } from '../api-response/index.ts';
import { encode } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  claimableHandle,
  ownPublicProfile,
  publicProfileBody,
} from '../../shared/public-profile/index.ts';
import type { OwnPublicProfile } from '../../shared/public-profile/index.ts';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import { publicModerationNotice } from '../../shared/public-moderation/index.ts';
import type { PublicModerationNotice } from '../../shared/public-moderation/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';

export class PublicProfiles {
  private readonly access: VaultAccess;
  private session: AccountSession | null = null;
  private generation = 0;
  profile: OwnPublicProfile | null = null;
  notices: PublicModerationNotice[] = [];
  moderationAfter: string | null = null;
  moderationOlder: string | null = null;
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
    this.notices = [];
    this.moderationAfter = null;
    this.moderationOlder = null;
    return true;
  }
  async request(
    operation: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const generation = this.generation;
    const data = await this.perform(operation, payload);
    if (generation !== this.generation) throw new Error('Sessão alterada.');
    this.profile = ownPublicProfile(data);
  }
  private async perform(
    operation: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.session)
      throw new Error(
        'Conecte e autorize seu aparelho para gerenciar o perfil público.',
      );
    const generation = this.generation;
    return this.access.withVault(false, async (authority) => {
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
      const response = await fetchApi(
        `public-profile/${operation}`,
        `/api/account/public-profile/${operation}`,
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
          signal: AbortSignal.timeout(8000),
        },
      );
      const data = await readApiJson(response, `public-profile/${operation}`);
      if (generation !== this.generation)
        throw new Error('Sessão alterada durante a operação.');
      return data;
    });
  }
  async refreshModeration(after: string | null = null): Promise<void> {
    const generation = this.generation;
    const data = await this.perform('moderation-notices', { after });
    if (generation !== this.generation) throw new Error('Sessão alterada.');
    if (!Array.isArray(data) || data.length > 32)
      throw new Error('Avisos de análise inválidos.');
    this.notices = data.map(publicModerationNotice);
    this.moderationAfter = after;
    this.moderationOlder =
      this.notices.length === 32 ? this.notices.at(-1)!.id : null;
  }
  async appeal(id: string, reason: string): Promise<void> {
    const generation = this.generation;
    const data = await this.perform('moderation-appeal', { id, reason });
    if (generation !== this.generation) throw new Error('Sessão alterada.');
    const notice = publicModerationNotice(data);
    this.notices = this.notices.map((old) =>
      old.id === notice.id ? notice : old,
    );
  }
  async refresh(): Promise<void> {
    await this.request('state', {});
  }
  async exists(): Promise<boolean> {
    return ownPublicProfile(await this.perform('state', {})) !== null;
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
