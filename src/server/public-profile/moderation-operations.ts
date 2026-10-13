import {
  AccountError,
  boundedText,
  keys,
  uuid,
} from '../../shared/account/index.ts';
import type {
  PublicProfileStore,
  ContactAuthority,
} from '../database/index.ts';
/** Validate signed moderation commands before calling the profile-owner contract. */
export function moderationOperation(
  store: PublicProfileStore,
  input: {
    operation: string;
    authority: ContactAuthority;
    data: Record<string, unknown>;
  },
) {
  const { operation, authority, data } = input;
  if (operation === 'moderation-details') {
    keys(data, ['id']);
    return store.moderationDetails(authority, uuid(data['id']));
  }
  if (operation === 'moderation-notices') {
    keys(data, ['after']);
    return store.moderationNotices(
      authority,
      data['after'] === null ? null : uuid(data['after']),
    );
  }
  if (operation === 'moderation-appeal') {
    keys(data, ['id', 'reason']);
    return store.moderationAppeal(authority, {
      id: uuid(data['id']),
      reason: boundedText(data['reason'], 2000),
    });
  }
  throw new AccountError(404, 'Operação de análise desconhecida.');
}
