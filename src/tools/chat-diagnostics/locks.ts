import { callerPositions, failureCategory } from './recording.ts';
import type { RecordEvent } from './recording.ts';

/** Observe existing exclusive operations; never bypass, cancel or take a lock. */
export function observeAuthorityLocks(record: RecordEvent) {
  const manager = navigator.locks;
  const active = new Set<string>();
  if (!manager) return { active: () => [], stop: () => {} };
  // Preserve the installed function's identity so stop can restore it exactly.
  const original = Reflect.get(manager, 'request');
  const descriptor = Object.getOwnPropertyDescriptor(manager, 'request');
  const nativeRequest = original.bind(manager);
  let sequence = 0;

  function request<T>(
    name: string,
    options: LockOptions | LockGrantedCallback<T>,
    callback?: LockGrantedCallback<T>,
  ): Promise<Awaited<T>> {
    const work = typeof options === 'function' ? options : callback;
    if (!name.startsWith('0xdmme-device-authority:') || !work)
      return typeof options === 'function'
        ? nativeRequest(name, options)
        : nativeRequest(name, options, callback!);
    const id = `lock-${++sequence}`;
    const queued = performance.now();
    let acquired = false;
    record('lock-queued', { id, caller: callerPositions() });
    const run = async (lock: Lock | null) => {
      acquired = true;
      const started = performance.now();
      if (lock) active.add(id);
      record(lock ? 'lock-acquired' : 'lock-unavailable', {
        id,
        waitMs: Math.round(started - queued),
      });
      try {
        return await work(lock);
      } finally {
        active.delete(id);
        record('lock-released', {
          id,
          heldMs: Math.round(performance.now() - started),
        });
      }
    };
    const result =
      typeof options === 'function'
        ? nativeRequest(name, run)
        : nativeRequest(name, options, run);
    return result.catch((error: unknown) => {
      record('lock-failed', {
        id,
        acquired,
        elapsedMs: Math.round(performance.now() - queued),
        reason: failureCategory(error),
      });
      throw error;
    });
  }
  manager.request = request;
  return {
    active: () => [...active].slice(0, 8),
    stop: () => {
      if (manager.request !== request) return;
      if (descriptor) Object.defineProperty(manager, 'request', descriptor);
      else Reflect.deleteProperty(manager, 'request');
    },
  };
}
