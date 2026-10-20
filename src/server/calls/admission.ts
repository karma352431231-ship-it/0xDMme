import { AccountError } from '../../shared/account/index.ts';
import { reserveOperationMemory } from '../memory-admission/index.ts';

/** Reservations cover volatile endpoint metadata and bounded encrypted signals. */
export function reserveCallState(kind: 'endpoint' | 'call'): () => void {
  const release = reserveOperationMemory(
    kind === 'endpoint' ? 131_072 : 1_048_576,
  );
  if (release) return release;
  if (kind === 'endpoint')
    throw new AccountError(429, 'Temporary connected device limit reached.');
  throw new AccountError(409, 'Call unavailable.');
}
