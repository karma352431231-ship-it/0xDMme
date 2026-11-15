import {
  AccountError,
  boundedText,
  keys,
  object,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  publicActivityKeys,
  publicActivitySources,
} from '../../shared/activity-snapshot/index.ts';
import type { PublicActivitySource } from '../../shared/activity-snapshot/index.ts';
import type { CommunityService } from '../communities/index.ts';
import type { PublicProfileService } from '../public-profile/index.ts';

interface ActivityServices {
  communities: Pick<CommunityService, 'operate'>;
  profiles: Pick<PublicProfileService, 'operate'>;
}
type ActivityResult = { data: unknown } | { status: number; error: string };

/** Each read keeps its original proof, authorization and visibility checks. */
export async function readPublicActivity(
  services: ActivityServices,
  session: () => Promise<AccountSession>,
  input: unknown,
  connected: () => boolean,
): Promise<Partial<Record<PublicActivitySource, ActivityResult>>> {
  const envelope = object(input);
  keys(envelope, ['directory', 'signatures']);
  const directory = boundedText(envelope['directory'], 64);
  if (!/^[a-f0-9]{64}$/u.test(directory))
    throw new AccountError(400, 'Invalid directory.');
  const signatures = object(envelope['signatures']);
  keys(signatures, publicActivityKeys);
  const proofs = publicActivityKeys.map((source) => ({
    source,
    signature: boundedText(signatures[source], 128),
  }));
  const results: Partial<Record<PublicActivitySource, ActivityResult>> = {};
  // One source at a time keeps this request's database concurrency bounded.
  for (const { source, signature } of proofs) {
    if (!connected()) break;
    const { service, operation, payload } = publicActivitySources[source];
    const owner =
      service === 'communities' ? services.communities : services.profiles;
    try {
      results[source] = {
        data: await owner.operate(operation, await session(), {
          signature,
          directory,
          payload,
        }),
      };
    } catch (error: unknown) {
      results[source] =
        error instanceof AccountError
          ? { status: error.status, error: error.message }
          : { status: 503, error: 'Account unavailable. Try again.' };
    }
  }
  return results;
}
