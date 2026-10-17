import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';

export type CapacityClient = Pick<pg.PoolClient, 'query'>;
export interface AdaptiveContentCapacity {
  readonly mode: 'volume';
  assert(
    client: CapacityClient,
    input: { logicalBytes: number; intent: 'growth' | 'reclaim' },
  ): Promise<void>;
  fits(
    client: CapacityClient,
    input: { logicalBytes: number; additionalBytes: number },
  ): Promise<boolean>;
}
export type ContentCapacity = number | AdaptiveContentCapacity;

export function contentCapacityUnavailable(): AccountError {
  return new AccountError(
    503,
    'Capacidade global ocupada pelos dados usados ou uploads em andamento. Retome depois.',
  );
}

/** Global coordination remains until the separate exact allocator replacement. */
export async function lockContentUsage(
  client: CapacityClient,
): Promise<number> {
  const result = await client.query<{ bytes: string }>(
    'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE',
  );
  const bytes = Number(result.rows[0]?.bytes);
  if (!Number.isSafeInteger(bytes) || bytes < 0)
    throw new Error('Contagem global indisponível.');
  return bytes;
}

async function enforce(
  client: CapacityClient,
  capacity: ContentCapacity,
  intent: 'growth' | 'reclaim',
) {
  const logicalBytes = await lockContentUsage(client);
  if (typeof capacity !== 'number')
    return capacity.assert(client, { logicalBytes, intent });
  if (
    !Number.isSafeInteger(capacity) ||
    capacity < 0 ||
    logicalBytes > capacity
  )
    throw contentCapacityUnavailable();
}

export async function assertContentCapacity(
  client: CapacityClient,
  capacity: ContentCapacity,
): Promise<void> {
  await enforce(client, capacity, 'growth');
}

/** Restricted to authorized cleanup operations; individual quotas still apply. */
export async function assertContentReclamationCapacity(
  client: CapacityClient,
  capacity: ContentCapacity,
): Promise<void> {
  await enforce(client, capacity, 'reclaim');
}

/** Advisory producer preflight. The final write must still assert in its transaction. */
export async function contentCapacityFits(
  client: CapacityClient,
  input: {
    capacity: ContentCapacity;
    logicalBytes: number;
    additionalBytes: number;
  },
): Promise<boolean> {
  if (!Number.isSafeInteger(input.additionalBytes) || input.additionalBytes < 0)
    throw contentCapacityUnavailable();
  if (typeof input.capacity === 'number')
    return input.logicalBytes + input.additionalBytes <= input.capacity;
  return input.capacity.fits(client, input);
}
