import { statfs } from 'node:fs/promises';
import { totalmem } from 'node:os';
import { getHeapStatistics } from 'node:v8';

/** Event-time measurements, not a recurring sampler or host CPU attribution. */
export async function sampleResources(directory: string) {
  const memory = process.memoryUsage();
  const heap = getHeapStatistics();
  const cpu = process.cpuUsage();
  const measuredAt = new Date().toISOString();
  const storage = await statfs(directory).then(
    (value) => ({
      availableBytes: value.bavail * value.bsize,
      totalBytes: value.blocks * value.bsize,
    }),
    () => null,
  );
  return {
    measuredAt,
    uptimeSeconds: process.uptime(),
    cpuUserSeconds: cpu.user / 1e6,
    cpuSystemSeconds: cpu.system / 1e6,
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    heapLimitBytes: heap.heap_size_limit,
    availableMemoryBytes: process.availableMemory(),
    memoryCeilingBytes: Math.min(
      totalmem(),
      process.constrainedMemory() || Infinity,
    ),
    storage,
  };
}
