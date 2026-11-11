import { chatSyncActive } from '../chat-sync-diagnostics/index.ts';
import type { startNativeRequest } from '../chat-sync-diagnostics/index.ts';
import type { NativeWireTiming } from '../../shared/chat-sync-diagnostics/native.ts';
type Trace = NonNullable<ReturnType<typeof startNativeRequest>>;
export function nativeClock(trace: Trace | undefined): number {
  return trace ? performance.now() : 0;
}
export function nativeElapsed(trace: Trace | undefined, start: number): number {
  return trace ? elapsedUs(start) : 0;
}
const wire = new WeakMap<object, number>();
const responses = new WeakMap<Response, Trace>();
const elapsedUs = (start: number) =>
  Math.max(0, Math.round((performance.now() - start) * 1000));

/** Channel parsing stays with the channel; only its duration follows the reply. */
export function measureNativeReply<T extends object>(parse: () => T): T {
  if (!chatSyncActive()) return parse();
  const start = performance.now(),
    reply = parse();
  const value: unknown = 'value' in reply ? reply.value : undefined;
  if (typeof value === 'object' && value !== null)
    wire.set(value, elapsedUs(start));
  return reply;
}
export function recordNativeRead(input: {
  trace: Trace | undefined;
  raw: unknown;
  started: number;
  timing: NativeWireTiming | undefined;
  decodeUs: number;
  blocks: number;
}): void {
  if (!input.trace) return;
  const bridgeUs = elapsedUs(input.started);
  const wireUs =
    typeof input.raw === 'object' && input.raw !== null
      ? (wire.get(input.raw) ?? 0)
      : 0;
  const timing = input.timing;
  input.trace('transfer', {
    nativeBridgeUs: bridgeUs,
    nativeWireUs: wireUs,
    nativeDecodeUs: input.decodeUs,
    nativeReadBlocks: input.blocks,
    ...(timing
      ? {
          nativeReceiveUs: timing.receiveUs,
          nativeEncodeUs: timing.encodeUs,
          nativeReceiveSamples: 1,
          nativeBridgeOnlyUs: Math.max(
            0,
            bridgeUs -
              input.decodeUs -
              wireUs -
              timing.receiveUs -
              timing.encodeUs,
          ),
        }
      : {}),
  });
}
export function observeNativeResponse(
  response: Response,
  trace: Trace | undefined,
): Response {
  if (trace) responses.set(response, trace);
  return response;
}
/** Response.text owns body assembly/UTF-8; JSON.parse is timed separately.
 * It preserves one-shot body use and the original SyntaxError/fetch failures. */
export async function readNativeJson(response: Response): Promise<unknown> {
  const trace = responses.get(response);
  if (!trace) return response.json();
  const started = performance.now();
  let bodyUs: number | undefined,
    parseUs = 0,
    success = false;
  try {
    const text = await response.text();
    bodyUs = elapsedUs(started);
    const parsing = performance.now();
    try {
      const result: unknown = JSON.parse(text);
      success = true;
      return result;
    } finally {
      parseUs = elapsedUs(parsing);
    }
  } finally {
    trace('json', {
      nativeBodyReadUs: bodyUs ?? elapsedUs(started),
      nativeJsonParseUs: parseUs,
      nativeJsonSuccess: success,
    });
  }
}
