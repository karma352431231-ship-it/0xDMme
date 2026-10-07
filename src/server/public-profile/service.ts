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
} from '../database/index.ts';
import type { PublicModerationNotice } from '../../shared/public-moderation/index.ts';
type PublicProfileResponse =
  | Awaited<ReturnType<PublicProfileStore['state']>>
  | PublicModerationNotice[]
  | PublicModerationNotice;
export class PublicProfileService {
  private readonly store: PublicProfileStore;
  private readonly devices: DeviceStore;
  constructor(store: PublicProfileStore, devices: DeviceStore) {
    this.store = store;
    this.devices = devices;
  }
  async read(handle: unknown) {
    const profile = await this.store.read(publicHandle(handle));
    if (!profile) throw new AccountError(404, 'Perfil público indisponível.');
    return profile;
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
}
