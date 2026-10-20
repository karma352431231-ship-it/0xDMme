import { ApiResponseError } from '../api-response/index.ts';

/** Retry an idempotent read once, rebuilding its complete snapshot and authority.
 * Never reuse this around publication, or retry revocation/other conflicts. */
export async function retrySnapshotRead<T>(
  read: () => Promise<T>,
  current: () => boolean,
): Promise<T> {
  try {
    return await read();
  } catch (error: unknown) {
    if (!current() || !snapshotChanged(error)) throw error;
    return read();
  }
}
function snapshotChanged(error: unknown): boolean {
  return (
    error instanceof ApiResponseError &&
    error.status === 409 &&
    error.failure === 'http' &&
    error.operation.startsWith('messages/') &&
    error.reason === 'Messages or permissions changed. Sync again.'
  );
}
