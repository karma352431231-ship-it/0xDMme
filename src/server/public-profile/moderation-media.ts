import { AccountError, encode } from '../../shared/account/index.ts';
import type {
  CommunityStore,
  ContactAuthority,
  PublicProfileStore,
} from '../database/index.ts';

/** Owner-only image access, independent of public approval and operator review. */
export class ModerationMedia {
  private readonly stores: {
    profiles: Pick<
      PublicProfileStore,
      'moderationOwnerSubject' | 'moderationCandidate'
    >;
    communities: Pick<CommunityStore, 'moderationCandidate'>;
  };
  constructor(stores: ModerationMedia['stores']) {
    this.stores = stores;
  }

  async read(authority: ContactAuthority, id: string) {
    const subject = await this.stores.profiles.moderationOwnerSubject(
      authority,
      id,
    );
    if (!subject || subject.kind === 'post-media')
      throw new AccountError(404, 'Arquivo da análise indisponível.');
    const read = () =>
      subject.kind === 'avatar' || subject.kind === 'profile-banner'
        ? this.stores.profiles.moderationCandidate(subject)
        : this.stores.communities.moderationCandidate(subject);
    const media = await read();
    // Recheck authorization/retention and the exact current binding after reading bytes.
    const current = await this.stores.profiles.moderationOwnerSubject(
      authority,
      id,
    );
    if (
      !media ||
      !current ||
      current.contentHash !== subject.contentHash ||
      !(await read())
    )
      throw new AccountError(404, 'Arquivo da análise indisponível.');
    return { type: media.type, bytes: encode(media.bytes) };
  }
}
