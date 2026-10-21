import type { RecordEvent } from './recording.ts';
import { isLiveChangeCategory } from '../../shared/live-changes/index.ts';

const controls = new Set([
  'heartbeat',
  'ready',
  'changed',
  'call',
  'removed',
  'authorization',
  'invalidated',
  'revoked',
  'ended',
]);

/** A stream may already be open before a console snippet is installed. Observe
 * only complete frames matching the app's empty control protocol. Never clone,
 * tee, consume, retain partial buffers, alter cancellation or record payloads.
 * Route attribution and split frames require a DevTools Network capture. */
export function controlFrames(value: unknown): string[] {
  if (!(value instanceof Uint8Array) || value.length > 4096) return [];
  if (value[0] !== 58 && value[0] !== 101) return [];
  const text = new TextDecoder().decode(value);
  if (!/^(?:(?:: heartbeat|event: [a-z-]+\ndata: \{\})\n\n)+$/u.test(text))
    return [];
  const events = text
    .split('\n\n')
    .filter(Boolean)
    .map((frame) =>
      frame === ': heartbeat'
        ? 'heartbeat'
        : frame.slice(7, frame.indexOf('\n')),
    );
  return events.every(
    (event) => controls.has(event) || isLiveChangeCategory(event),
  )
    ? events
    : [];
}

export function observeControlFrames(record: RecordEvent): () => void {
  const prototype = ReadableStreamDefaultReader.prototype;
  const original = Reflect.get(prototype, 'read');
  const read = function (this: ReadableStreamDefaultReader<unknown>) {
    const pending: Promise<ReadableStreamReadResult<unknown>> =
      original.call(this);
    return pending.then((result) => {
      if (!result.done) {
        for (const event of controlFrames(result.value))
          record('stream-control', { event, attribution: 'protocol-only' });
      }
      return result;
    });
  };
  prototype.read = read;
  return () => {
    if (prototype.read === read) prototype.read = original;
  };
}
