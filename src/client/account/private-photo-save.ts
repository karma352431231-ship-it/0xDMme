import { AccountError } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type {
  PrivatePhotoDraft,
  PrivateProfile,
} from '../account-profile/index.ts';
import { writePrivateProfile } from './private-profile-write.ts';
import type { ProfileWriter } from './private-profile-write.ts';

/** Save only the chosen photo. Name/privacy drafts remain unconfirmed. On
 * failure discard the candidate, keeping the saved photo and update readiness. */
export async function savePrivatePhoto(input: {
  session: AccountSession;
  key: CryptoKey;
  profile: PrivateProfile;
  draft: PrivatePhotoDraft;
  stage: () => Promise<void>;
  current: () => boolean;
  save?: ProfileWriter;
}): Promise<number | null> {
  try {
    await input.stage();
    if (!input.current()) return null;
    const revision = await writePrivateProfile({
      session: input.session,
      key: input.key,
      value: {
        ...input.profile,
        photo: input.draft.value(input.profile.photo),
      },
      current: input.current,
      ...(input.save ? { save: input.save } : {}),
    });
    if (!input.current()) return null;
    input.draft.commit(input.profile);
    return revision;
  } catch (error: unknown) {
    if (error instanceof AccountError) throw error;
    throw new AccountError(
      409,
      'Could not save the photo. Select it again to retry.',
    );
  } finally {
    input.draft.clear();
  }
}
