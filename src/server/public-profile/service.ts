import type { ModerationMedia } from './moderation-media.ts';
import type { MentionNotificationPage } from '../../shared/mention-notifications/index.ts';
import { moderationOperation } from './moderation-operations.ts';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
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
import type { PublicModerationDetails } from '../../shared/moderation-details/index.ts';
type PublicProfileResponse =
  | Awaited<ReturnType<ModerationMedia['read']>>
  | MentionNotificationPage
  | { saved: true }
  | Awaited<ReturnType<PublicProfileStore['state']>>
  | PublicModerationDetails
  | PublicModerationNotice[]
  | PublicModerationNotice
  | Awaited<ReturnType<PublicProfileStore['banners']['state']>>
  | Awaited<ReturnType<PublicProfileStore['descriptions']['state']>>
  | Awaited<ReturnType<ProfileSocialStore['operate']>>;
export class PublicProfileService {
  private readonly store: PublicProfileStore;
  private readonly devices: DeviceStore;
  private readonly social: ProfileSocialStore | undefined;
  private readonly moderationMedia: Pick<ModerationMedia, 'read'> | undefined;
  constructor(
    store: PublicProfileStore,
    devices: DeviceStore,
    social?: ProfileSocialStore,
    moderationMedia?: Pick<ModerationMedia, 'read'>,
  ) {
    this.store = store;
    this.devices = devices;
    this.social = social;
    this.moderationMedia = moderationMedia;
  }
  async read(handle: unknown) {
    const profile = await this.store.read(publicHandle(handle));
    if (!profile) throw new AccountError(404, 'Public profile unavailable.');
    return profile;
  }
  async readById(id: string) {
    const profile = await this.store.readById(id);
    if (!profile) throw new AccountError(404, 'Public profile unavailable.');
    return profile;
  }
  suggestions(query: string) {
    return this.store.suggestions(query);
  }
  private pages(): ProfileSocialStore {
    if (!this.social) throw new AccountError(503, 'Public page unavailable.');
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
        'mutual-followers',
        'follow',
        'block-state',
        'block',
        'public-report',
        'notification-state',
        'notification-set',
        'activity',
        'moderation-notices',
        'moderation-details',
        'moderation-media',
        'mention-notifications',
        'mention-notifications-read',
        'moderation-appeal',
      ].includes(operation)
    )
      throw new AccountError(404, 'Public profile operation not found.');
    const proof = publicProfileProof(input);
    const current = await this.devices.current(session.accountId);
    const signer =
      current &&
      directoryEvent(current.event).devices.find(
        (device) => device.id === session.deviceId,
      );
    if (!signer || current?.head !== proof.directory)
      throw new AccountError(403, 'Device has no current authorization.');
    await verify(
      signer.signing,
      proof.signature,
      publicProfileBody(session.accountId, session.deviceId, operation, {
        directory: proof.directory,
        payload: proof.payload,
      }),
    );
    const authority = { session, directory: proof.directory };
    if (
      operation === 'mention-notifications' ||
      operation === 'mention-notifications-read'
    )
      return this.store.mentionOperation(operation, authority, proof.payload);
    return this.execute(operation, authority, proof.payload);
  }
  private async execute(
    operation: string,
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ) {
    if (
      [
        'follow',
        'follow-state',
        'mutual-followers',
        'banner',
        'banner-state',
        'block',
        'block-state',
        'public-report',
        'notification-state',
        'notification-set',
        'activity',
      ].includes(operation)
    )
      return this.socialOperation(operation, authority, data);
    if (operation === 'description-state' || operation === 'description')
      return this.descriptionOperation(operation, authority, data);
    if (operation === 'moderation-media') {
      keys(data, ['id']);
      if (!this.moderationMedia)
        throw new AccountError(503, 'Review media unavailable.');
      return this.moderationMedia.read(authority, uuid(data['id']));
    }
    if (operation.startsWith('moderation-'))
      return moderationOperation(this.store, { operation, authority, data });
    if (operation === 'state') {
      keys(data, []);
      return this.store.state(authority);
    }
    if (operation === 'create') {
      keys(data, ['handle', 'consent']);
      if (data['consent'] !== true)
        throw new AccountError(
          400,
          'Explicitly confirm public profile creation.',
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
    if (
      [
        'follow',
        'follow-state',
        'mutual-followers',
        'block',
        'block-state',
        'public-report',
        'notification-state',
        'notification-set',
        'activity',
      ].includes(operation)
    )
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
