import { NativeExchange } from './exchange.ts';
import { nativeFailure, nativeRequest } from './protocol.ts';
import type { NativeSessionBridge } from './protocol.ts';
export type { NativeApiRequest, NativeSessionBridge } from './protocol.ts';

/** The pool owns admission and shutdown; exchanges own individual lifetimes.
 * This class adapts a native implementation; it never implements a cookie jar,
 * weakens server origin checks, retries mutations or falls back to browser HTTP.
 */
export class NativeApiTransport {
  private readonly bridge: NativeSessionBridge;
  private readonly exchanges = new Set<NativeExchange>();
  private closed = false;
  constructor(bridge: NativeSessionBridge) {
    this.bridge = bridge;
  }

  async fetch(path: string, input: RequestInit): Promise<Response> {
    if (this.closed || this.exchanges.size >= 8) throw nativeFailure();
    if (input.signal?.aborted)
      throw new DOMException('Native API request cancelled.', 'AbortError');
    let request;
    try {
      request = nativeRequest(path, input);
    } catch {
      throw nativeFailure();
    }
    const exchange = new NativeExchange({
      bridge: this.bridge,
      request,
      signal: input.signal,
      released: (clean) => {
        this.exchanges.delete(exchange);
        if (!clean) void this.close();
      },
    });
    this.exchanges.add(exchange);
    return exchange.response();
  }

  /** A failed native cancel disables this instance: no accumulated orphan work. */
  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(
      [...this.exchanges].map((exchange) =>
        exchange.cancel(
          new DOMException('Native API transport closed.', 'AbortError'),
        ),
      ),
    );
  }
}
