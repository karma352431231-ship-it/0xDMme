import { callerPositions, failureCategory } from './recording.ts';
import type { RecordEvent } from './recording.ts';

const operations = new Set([
  'snapshot',
  'confirm',
  'delivery',
  'page',
  'preview',
  'changes',
  'relations',
  'object',
  'acknowledge',
  'live',
  'publish',
  'delete',
  'directory',
  'history',
  'matrix-inbox',
  'matrix-received',
  'matrix-upload',
  'matrix-query',
  'matrix-claim',
  'matrix-send',
  'recovery-key',
  'recovery-current',
  'recovery-register',
  'recovery-peer',
  'daily-states',
  'daily-configure',
  'daily-heartbeat',
  'daily-read',
  'daily-receipts',
  'daily-push-state',
  'group-list',
  'group-preview',
  'group-snapshot',
  'group-confirm',
  'group-changes',
  'group-read',
  'group-page',
  'group-incoming',
  'group-daily-states',
  'group-daily-read',
  'group-daily-receipts',
]);
const dmOperations = new Set([
  ...[...operations].map((operation) => `dm-${operation}`),
  ...[
    'accepted',
    'list',
    'state',
    'open',
    'secret-get',
    'secret-save',
    'personal-page',
    'personal-snapshot',
    'message-history',
    'message-status',
    'preview-status',
    'received',
  ].map((operation) => `dm-${operation}`),
]);
const calls = new Set([
  'sync',
  'start',
  'accept',
  'turn',
  'offer',
  'answer',
  'end',
  'configure',
]);
const areas = new Map([
  ['messages', new Set([...operations, ...dmOperations])],
  ['calls', calls],
  ['devices', new Set(['read'])],
]);

/** Exact operation allowlist. Query strings, dynamic segments and foreign
 * requests never enter the report; request/response bodies are never read. */
export function requestCategory(input: RequestInfo | URL): string | null {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    location.href,
  );
  if (url.origin !== location.origin) return null;
  const parts = url.pathname.split('/');
  if (parts.length !== 5 || parts[1] !== 'api' || parts[2] !== 'account')
    return null;
  const area = parts[3]!,
    op = parts[4]!;
  if (areas.get(area)?.has(op)) return `${area}/${op}`;
  return 'other-account-api';
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
