import { historySliceLimit } from '../../shared/messages/index.ts';

export const historyPage = historySliceLimit;
/** One displayed window is bounded even after repeated paging. */
export const historyRootLimit = 512;
