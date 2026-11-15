import {
  AccountError,
  boundedText,
  keys,
  object,
} from '../../shared/account/index.ts';
import {
  activitySnapshotPath,
  publicActivityKeys,
  publicActivitySources,
} from '../../shared/activity-snapshot/index.ts';
import type { PublicActivitySource } from '../../shared/activity-snapshot/index.ts';
import { communityBody } from '../../shared/communities/index.ts';
import { publicProfileBody } from '../../shared/public-profile/index.ts';
import {
  ApiResponseError,
  fetchApi,
  readApiJson,
} from '../api-response/index.ts';
import { withSigner } from '../vault-authority/index.ts';
import type {
  SigningAuthority,
  VaultAccess,
} from '../vault-authority/index.ts';

export type PublicActivityRead = (source: PublicActivitySource) => unknown;

function readSource(raw: unknown, source: PublicActivitySource): unknown {
  const result = object(raw);
  if (Object.hasOwn(result, 'data')) {
    keys(result, ['data']);
    return result['data'];
  }
  keys(result, ['status', 'error']);
  const status = result['status'];
  if (
    typeof status !== 'number' ||
    !Number.isInteger(status) ||
    status < 400 ||
    status > 599
  )
    throw new AccountError(400, 'Invalid data.');
  const { service, operation } = publicActivitySources[source];
  throw new ApiResponseError({
    operation: `${service}/${operation}`,
    status,
    message: boundedText(result['error'], 200),
    failure: 'http',
    responseType: 'json',
  });
}

async function requestSnapshot(
  authority: SigningAuthority,
  current: () => boolean,
): Promise<PublicActivityRead | null> {
  const { session, directory } = authority;
  const signatures: Partial<Record<PublicActivitySource, string>> = {};
  for (const source of publicActivityKeys) {
    if (!current()) return null;
    const { service, operation, payload } = publicActivitySources[source];
    const body = service === 'communities' ? communityBody : publicProfileBody;
    signatures[source] = await authority.sign(
      body(session.accountId, session.deviceId, operation, {
        directory,
        payload,
      }),
    );
  }
  if (!current()) return null;
  const response = await fetchApi('activity-snapshot', activitySnapshotPath, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      'X-Hash-Talk-CSRF': session.csrf,
    },
    body: JSON.stringify({ directory, signatures }),
    signal: AbortSignal.timeout(8000),
  });
  const snapshot = object(await readApiJson(response, 'activity-snapshot'));
  keys(snapshot, publicActivityKeys);
  return (source) => readSource(snapshot[source], source);
}

/** Older servers keep their original reads for the rest of the page lifetime. */
export function publicActivityReader(access: VaultAccess) {
  let supported = true;
  return async (current: () => boolean): Promise<PublicActivityRead | null> => {
    if (!supported || !current()) return null;
    try {
      return await withSigner(access, (authority) =>
        requestSnapshot(authority, current),
      );
    } catch (error: unknown) {
      if (
        !(error instanceof ApiResponseError) ||
        error.operation !== 'activity-snapshot' ||
        error.status !== 404 ||
        error.reason !== 'Operation not found.'
      )
        throw error;
      supported = false;
      return null;
    }
  };
}
