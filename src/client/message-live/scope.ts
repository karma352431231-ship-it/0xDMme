import { isLiveChangeCategory } from '../../shared/live-changes/index.ts';
import type { LiveChangeCategory } from '../../shared/live-changes/index.ts';
import type { LiveControlEvent, LiveEvent } from './protocol.ts';

/** Each feature declares its own interests. Categories schedule the feature's
 * existing authenticated reads; they are never content or authority. General
 * recovery and closing controls still reach every feature. */
export function scopedLiveEvent(
  event: LiveEvent,
  categories: readonly LiveChangeCategory[],
): LiveControlEvent | null {
  if (isLiveChangeCategory(event))
    return categories.includes(event) ? 'changed' : null;
  return event;
}
