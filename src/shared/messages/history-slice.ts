import { AccountError, keys } from '../account/index.ts';
import { integer } from '../vault/index.ts';

export const historySliceLimit = 16;
export interface HistorySlice {
  direction: 'older' | 'newer';
  cursor: number;
  limit: number;
}

/** A position in an already authorized conversation, never a search term. */
export function historySlice(value: Record<string, unknown>): HistorySlice {
  keys(value, ['direction', 'cursor', 'limit']);
  const direction = value['direction'];
  const limit = integer(value['limit'], historySliceLimit);
  const cursor = integer(value['cursor'], Number.MAX_SAFE_INTEGER);
  if (!limit || (direction !== 'older' && direction !== 'newer'))
    throw new AccountError(400, 'Invalid message window.');
  return { direction, cursor, limit };
}
