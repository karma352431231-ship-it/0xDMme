/** Empty authenticated hints identify an area, never an entity or its content. */
export const liveChangeCategories = [
  'private-messages',
  'private-receipts',
  'handle-messages',
  'handle-receipts',
  'group-messages',
  'group-receipts',
  'contacts',
  'status',
  'activity',
  'vault',
] as const;
export type LiveChangeCategory = (typeof liveChangeCategories)[number];
const categoryNames: ReadonlySet<string> = new Set(liveChangeCategories);
export function isLiveChangeCategory(
  value: unknown,
): value is LiveChangeCategory {
  return typeof value === 'string' && categoryNames.has(value);
}
