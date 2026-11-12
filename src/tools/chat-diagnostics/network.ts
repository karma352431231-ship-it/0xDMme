import { diagnosticRequestCategory } from '../../shared/chat-sync-diagnostics/network.ts';
import { callerPositions, failureCategory } from './recording.ts';
import type { RecordEvent } from './recording.ts';

/** Exact operation allowlist. Query strings, dynamic segments and foreign
 * requests never enter the report; request/response bodies are never read. */
export function requestCategory(input: RequestInfo | URL): string | null {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    location.href,
  );
  if (url.origin !== location.origin) return null;
  const category = diagnosticRequestCategory(url.pathname);
  return category === 'other-api' ? null : category;
}

export function observeNetwork(record: RecordEvent, locks: () => string[]) {
  const host = window;
  const original = Reflect.get(host, 'fetch');
  const responses = new WeakMap<Response, { id: string; started: number }>();
  let sequence = 0;
  const fetch: typeof window.fetch = async function (input, options) {
    const category = requestCategory(input);
    if (!category) return original.call(host, input, options);
    const id = `request-${++sequence}`,
      started = performance.now();
    record('request-start', {
      id,
      category,
      locks: locks(),
      caller: callerPositions(),
    });
    try {
      const response = await original.call(host, input, options);
      responses.set(response, { id, started });
      record('response-headers', {
        id,
        status: response.status,
        serverUnixMs: Number(response.headers.get('x-0xdmme-server-time')) || 0,
        durationMs: Math.round(performance.now() - started),
      });
      return response;
    } catch (error: unknown) {
      record('request-failed', {
        id,
        reason: failureCategory(error),
        durationMs: Math.round(performance.now() - started),
      });
      throw error;
    }
  };
  host.fetch = fetch;
  // Observe when the application's own JSON read finishes. Keep the original
  // Response identity and body, and return its value/error without inspecting it.
  const json = Reflect.get(Response.prototype, 'json');
  const read: typeof json = async function (this: Response) {
    const request = responses.get(this);
    try {
      const value: unknown = await json.call(this);
      if (request)
        record('response-body', {
          id: request.id,
          durationMs: Math.round(performance.now() - request.started),
        });
      return value;
    } catch (error: unknown) {
      if (request)
        record('response-body-failed', {
          id: request.id,
          reason: failureCategory(error),
        });
      throw error;
    }
  };
  Response.prototype.json = read;
  return () => {
    if (host.fetch === fetch) host.fetch = original;
    if (Response.prototype.json === read) Response.prototype.json = json;
  };
}
