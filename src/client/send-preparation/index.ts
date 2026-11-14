import { ApiResponseError } from '../api-response/index.ts';
import { AccountError, object, keys } from '../../shared/account/index.ts';
import type { Api } from '../peer-identity/index.ts';

/** Session-scoped capability detection for the optional combined read. */
export class SendPreparationRead {
  private available = true;
  async read(api: Api, operation: string, payload: Record<string, unknown>) {
    if (!this.available) return null;
    try {
      return object(await api(operation, payload));
    } catch (error: unknown) {
      if (!unavailable(error)) throw error;
      this.available = false;
      return null;
    }
  }
}

function unavailable(error: unknown): boolean {
  if (!(error instanceof AccountError) || error.status !== 404) return false;
  const reason =
    error instanceof ApiResponseError ? error.reason : error.message;
  return reason === 'Message operation unavailable.';
}

export function preparedRecovery(raw: Record<string, unknown>) {
  keys(raw, ['directory', 'recovery']);
  const recovery = object(raw['recovery']);
  keys(recovery, ['own', 'peer']);
  return { own: recovery['own'], peer: recovery['peer'] };
}
