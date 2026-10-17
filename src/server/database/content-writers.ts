import type { ContentCapacity } from './content-capacity.ts';
import { ContentWriteAllocations } from './content-write-allocations.ts';
import { VaultAllocations } from './vault-allocations.ts';
import { MessageReadAllocations } from './message-read-allocations.ts';
import { MessageAllocations } from './message-allocations.ts';

/** Compose adopted writers around one coordinator, within the existing budget. */
export function createContentWriters(input: {
  connectionString: string;
  capacity: ContentCapacity;
  role: 'web' | 'worker';
  failed: () => void;
}): {
  allocations: ContentWriteAllocations | undefined;
  vault: VaultAllocations | undefined;
  messages: MessageAllocations | undefined;
  reads: MessageReadAllocations | undefined;
} {
  if (typeof input.capacity === 'number' || input.role !== 'web')
    return {
      allocations: undefined,
      vault: undefined,
      messages: undefined,
      reads: undefined,
    };
  const allocations = new ContentWriteAllocations({
    ...input,
    capacity: input.capacity,
  });
  return {
    allocations,
    vault: new VaultAllocations(allocations, input.capacity),
    messages: new MessageAllocations(allocations),
    reads: new MessageReadAllocations(allocations),
  };
}
