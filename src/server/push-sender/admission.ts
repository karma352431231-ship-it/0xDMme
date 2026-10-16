import { getHeapStatistics } from 'node:v8';

/** Reserve headroom for bounded payloads, agents and encrypted sends. */
export class PushSendBudget {
  private active = 0;
  take(): (() => void) | null {
    const heap = getHeapStatistics();
    const bytes = Math.min(
      process.availableMemory(),
      heap.heap_size_limit - heap.used_heap_size,
    );
    const capacity = Math.max(0, Math.floor(bytes / 1_048_576));
    if (this.active >= capacity) return null;
    this.active++;
    return () => {
      this.active--;
    };
  }
}
