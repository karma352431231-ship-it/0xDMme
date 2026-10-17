import { AccountError } from '../../shared/account/index.ts';
import type {
  AccountSession,
  EncryptedProfile,
} from '../../shared/account/index.ts';
import { sealProfile } from '../account-profile/index.ts';
import type { PrivateProfile } from '../account-profile/index.ts';
import { api } from './core.ts';

export type ProfileWriter = (
  session: AccountSession,
  profile: EncryptedProfile,
  key: CryptoKey,
) => Promise<void>;

/** Both explicit preference confirmation and photo autosave use the same
 * revision/encryption boundary. Reject a replaced session before any write. */
export async function writePrivateProfile(input: {
  session: AccountSession;
  key: CryptoKey;
  value: PrivateProfile;
  current: () => boolean;
  save?: ProfileWriter;
}): Promise<number> {
  const revision = input.session.profileRevision + 1;
  const envelope = await sealProfile({
    profile: input.value,
    key: input.key,
    accountId: input.session.accountId,
    revision,
  });
  if (!input.current()) throw new AccountError(409, 'Sessão alterada.');
  if (input.save) await input.save(input.session, envelope, input.key);
  else await api('profile', { input: envelope, csrf: input.session.csrf });
  return revision;
}
