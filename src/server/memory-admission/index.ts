import { getHeapStatistics } from 'node:v8';

let reservedBytes = 0;

/** Process-wide headroom for owned operations; reservations never retain payloads. */
export function reserveOperationMemory(bytes: number): (() => void) | null {
  if (!Number.isSafeInteger(bytes) || bytes <= 0)
    throw new RangeError('Invalid operation memory reservation.');
  const heap = getHeapStatistics();
  const available = Math.min(
    process.availableMemory(),
    heap.heap_size_limit - heap.used_heap_size,
  );
  if (reservedBytes + bytes > available) return null;
  reservedBytes += bytes;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    reservedBytes -= bytes;
  };
}
