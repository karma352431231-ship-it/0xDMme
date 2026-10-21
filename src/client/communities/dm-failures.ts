import { AccountError } from '../../shared/account/index.ts';
import { expectedInterruption } from '../synchronization-work/index.ts';
/** A late denial still closes the same account's memory projections. Obsolete
 * navigation and old-session results have no authority over the current view. */
export function dmFailure(
  error: unknown,
  state: { sameSession: boolean; current: boolean },
): 'ignore' | 'continue' | 'deny' | 'fail' {
  if (!state.sameSession) return 'ignore';
  if (error instanceof AccountError && [401, 403, 409].includes(error.status))
    return 'deny';
  if (!state.current) return 'ignore';
  return expectedInterruption(error) ? 'continue' : 'fail';
}
