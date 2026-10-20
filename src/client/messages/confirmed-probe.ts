import { t } from '../../shared/i18n/index.ts';
import type { MessageVisibility } from '../message-visibility/index.ts';
import { readDelivery } from './delivery.ts';
import type { DeliveryView } from './delivery.ts';
import type { Api } from './history.ts';
import { snapshotChanged } from './snapshot-retry.ts';

/** Delivery authenticates the complete cached snapshot on the server, including
 * consent and directory revisions. It can be the final check for an already
 * verified window; fresh content still uses the independent read/confirm path. */
export async function probeConfirmed<T extends DeliveryView>(input: {
  candidate: { snapshot: string; views: readonly T[] };
  api: Api;
  visibility: MessageVisibility<T>;
  token: number;
}): Promise<T[] | null> {
  const snapshot: unknown = JSON.parse(input.candidate.snapshot);
  for (let attempt = 0; attempt < 3; attempt++) {
    const version = input.visibility.verificationVersion(input.token);
    let views: T[];
    try {
      views = await readDelivery({
        api: input.api,
        snapshot,
        views: input.candidate.views,
      });
      // Empty and entirely archived windows do not issue a delivery request.
      if (!views.some((view) => !view.archived))
        await input.api('confirm', { snapshot });
    } catch (error: unknown) {
      if (snapshotChanged(error)) return null;
      throw error;
    }
    if (version !== input.visibility.verificationVersion(input.token)) continue;
    input.visibility.stage(input.token, views);
    input.visibility.complete(input.token, version);
    return views;
  }
  throw new Error(t('New updates arrived during verification. Sync again.'));
}
