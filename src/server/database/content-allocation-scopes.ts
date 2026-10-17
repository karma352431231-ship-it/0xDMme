export type ContentAllocationScope =
  | 'prepared'
  | 'vault-reserve'
  | 'vault-maintain'
  | 'message-admit'
  | 'message-read'
  | 'message-remove';

/** Maintenance spends the existing per-owner SQL reserve, never payload room. */
const maintenanceScopes = ['vault-maintain', 'message-remove'] as const;
export function maintenanceAllocation(scope: ContentAllocationScope): boolean {
  return maintenanceScopes.some((value) => value === scope);
}
// Static authored identifiers only; used by both grant and physical-policy reads.
export const growthAllocationPredicate = `scope NOT IN (${maintenanceScopes
  .map((scope) => `'${scope}'`)
  .join(',')})`;
