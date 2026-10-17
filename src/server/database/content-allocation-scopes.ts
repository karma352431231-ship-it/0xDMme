import { contentSqlTransactionBytes } from './content-capacity.ts';

export type ContentAllocationScope =
  | 'prepared'
  | 'vault-reserve'
  | 'vault-maintain'
  | 'message-admit'
  | 'message-read'
  | 'message-remove'
  | 'message-open'
  | 'personal-clean'
  | 'file-reclaim';

/** Maintenance uses the existing SQL allowance; excess needs physical credits. */
const maintenanceScopes = [
  'vault-maintain',
  'message-remove',
  'personal-clean',
  'file-reclaim',
] as const;
export function maintenanceAllocation(scope: ContentAllocationScope): boolean {
  return maintenanceScopes.some((value) => value === scope);
}
// Static authored identifiers only; used by both grant and physical-policy reads.
export const physicalAllocationBytesSql = `CASE WHEN scope IN (${maintenanceScopes
  .map((scope) => `'${scope}'`)
  .join(
    ',',
  )}) THEN greatest(bytes-${contentSqlTransactionBytes},0) ELSE bytes END`;

export function physicalAllocationBytes(
  bytes: bigint,
  scope: ContentAllocationScope,
): bigint {
  if (!maintenanceAllocation(scope)) return bytes;
  const excess = bytes - BigInt(contentSqlTransactionBytes);
  return excess > 0n ? excess : 0n;
}
