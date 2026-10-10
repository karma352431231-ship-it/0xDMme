import {
  AccountError,
  boundedText,
  keys,
  uuid,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { directoryEvent, verify } from '../../shared/devices/index.ts';
import {
  claimableHandle,
  profileRevision,
  publicHandle,
  publicProfileBody,
  publicProfileProof,
} from '../../shared/public-profile/index.ts';
import { pendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import type {
  ContactAuthority,
  DeviceStore,
  PublicProfileStore,
  ProfileSocialStore,
} from '../database/index.ts';
import type { PublicModerationNotice } from '../../shared/public-moderation/index.ts';
import { postCount } from '../../shared/community-posts/index.ts';
import { profileDescriptionText } from '../../shared/profile-social/index.ts';
type PublicProfileResponse =
  | Awaited<ReturnType<PublicProfileStore['state']>>
  | PublicModerationNotice[]
  | PublicModerationNotice
  | Awaited<ReturnType<PublicProfileStore['banners']['state']>>
  | Awaited<ReturnType<PublicProfileStore['descriptions']['state']>>
  | Awaited<ReturnType<ProfileSocialStore['operate']>>;
export class PublicProfileService {
  private readonly store: PublicProfileStore;
  private readonly devices: DeviceStore;
  private readonly social: ProfileSocialStore | undefined;
  constructor(
    store: PublicProfileStore,
    devices: DeviceStore,
    social?: ProfileSocialStore,
  ) {
    this.store = store;
    this.devices = devices;
    this.social = social;
  }
  async read(handle: unknown) {
    const profile = await this.store.read(publicHandle(handle));
    if (!profile) throw new AccountError(404, 'Perfil público indisponível.');
    return profile;
  }
  private pages(): ProfileSocialStore {
    if (!this.social)
      throw new AccountError(503, 'Página pública indisponível.');
    return this.social;
  }
  summary(handle: string) {
    return this.pages().summary(publicHandle(handle));
  }
  memberships(handle: string, after: string | null) {
    return this.pages().memberships(publicHandle(handle), after);
  }
  activity(handle: string, tab: string, after: string | null) {
    return this.pages().activity(publicHandle(handle), tab, after);
  }
  operate(
    operation: 'state' | 'create' | 'avatar',
    session: AccountSession,
    input: unknown,
  ): ReturnType<PublicProfileStore['state']>;
  operate(
    operation: 'moderation-notices',
    session: AccountSession,
    input: unknown,
  ): Promise<PublicModerationNotice[]>;
  operate(
    operation: 'moderation-appeal',
    session: AccountSession,
    input: unknown,
  ): Promise<PublicModerationNotice>;
  operate(
    operation: string,
    session: AccountSession,
    input: unknown,
  ): Promise<PublicProfileResponse>;
  async operate(
    operation: string,
    session: AccountSession,
    input: unknown,
  ): Promise<PublicProfileResponse> {
    if (
      ![
        'state',
        'create',
        'avatar',
        'banner-state',
        'banner',
        'description-state',
        'description',
        'follow-state',
        'follow',
        'moderation-notices',
        'moderation-appeal',
      ].includes(operation)
    )
      throw new AccountError(404, 'Operação de perfil público não encontrada.');
    const proof = publicProfileProof(input);
    const current = await this.devices.current(session.accountId);
    const signer =
      current &&
      directoryEvent(current.event).devices.find(
        (device) => device.id === session.deviceId,
      );
    if (!signer || current?.head !== proof.directory)
      throw new AccountError(403, 'Aparelho sem autorização atual.');
    await verify(
      signer.signing,
      proof.signature,
      publicProfileBody(session.accountId, session.deviceId, operation, {
        directory: proof.directory,
        payload: proof.payload,
      }),
    );
    const authority = { session, directory: proof.directory };
    return this.execute(operation, authority, proof.payload);
  }
  private async execute(
    operation: string,
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ) {
    if (
      ['follow', 'follow-state', 'banner', 'banner-state'].includes(operation)
    )
      return this.socialOperation(operation, authority, data);
    if (operation === 'description-state' || operation === 'description')
      return this.descriptionOperation(operation, authority, data);
    if (operation === 'moderation-notices') {
      keys(data, ['after']);
      return this.store.moderationNotices(
        authority,
        data['after'] === null ? null : uuid(data['after']),
      );
    }
    if (operation === 'moderation-appeal') {
      keys(data, ['id', 'reason']);
      return this.store.moderationAppeal(authority, {
        id: uuid(data['id']),
        reason: boundedText(data['reason'], 2_000),
      });
    }
    if (operation === 'state') {
      keys(data, []);
      return this.store.state(authority);
    }
    if (operation === 'create') {
      keys(data, ['handle', 'consent']);
      if (data['consent'] !== true)
        throw new AccountError(
          400,
          'Confirme a criação explícita do perfil público.',
        );
      return this.store.create(authority, claimableHandle(data['handle']));
    }
    keys(data, ['revision', 'avatar']);
    return this.store.avatar(
      authority,
      profileRevision(data['revision']),
      pendingPublicAvatar(data['avatar']),
    );
  }
  private descriptionOperation(
    operation: 'description-state' | 'description',
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ) {
    if (operation === 'description-state') {
      keys(data, []);
      return this.store.descriptions.state(authority);
    }
    keys(data, ['revision', 'description']);
    return this.store.descriptions.replace(
      authority,
      postCount(data['revision']),
      profileDescriptionText(data['description']),
    );
  }
  private socialOperation(
    operation: string,
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ) {
    if (operation === 'follow' || operation === 'follow-state')
      return this.pages().operate(operation, authority, data);
    if (operation === 'banner-state') {
      keys(data, []);
      return this.store.banners.state(authority);
    }
    keys(data, ['revision', 'banner']);
    return this.store.banners.replace(
      authority,
      postCount(data['revision']),
      pendingPublicAvatar(data['banner']),
    );
  }
}
