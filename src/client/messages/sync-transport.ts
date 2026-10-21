import { messageApi } from '../message-api/index.ts';
import { isSyncSnapshot } from '../../shared/message-sync/index.ts';

/** Live reads negotiate v2 explicitly. Export/legacy callers keep their original
 * snapshot contract, signatures and error behavior. No write is retried. */
export const syncMessageApi: typeof messageApi = (
  authority,
  operation,
  payload,
  control,
) => {
  if (operation !== 'snapshot')
    return messageApi(authority, operation, payload, control);
  const from = payload['from'];
  return messageApi(
    authority,
    'sync-state',
    { from: isSyncSnapshot(from) ? from : null },
    control,
  );
};
