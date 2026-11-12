import { decodeCanonicalBase64 } from '../../shared/base64/index.ts';
import { readNativeWireTiming } from '../../shared/chat-sync-diagnostics/native.ts';
import type { NativeWireTiming } from '../../shared/chat-sync-diagnostics/native.ts';
export const chunkBytes = 128 * 1024;
export const responseBytes = 256 * 1024 * 1024;
const requestBytes = 8_400_000;
const origin = 'https://0xdmme.app';

export interface NativeApiRequest {
  id: string;
  path: string;
  method: 'GET' | 'HEAD' | 'POST';
  credentials: 'same-origin' | 'omit';
  headers: Record<string, string>;
  body?: string;
}

/** Native owners independently validate every input, own TLS/cookies and release
 * the exchange on EOF/cancel. Never return cookies, URLs or native exceptions.
 * Reads are demand-driven: at most one outstanding read and one bounded chunk.
 */
export interface NativeSessionBridge {
  open(request: NativeApiRequest): Promise<unknown>;
  read(request: { id: string; bytes: number }): Promise<unknown>;
  cancel(request: { id: string }): Promise<void>;
}

export function nativeFailure(): TypeError {
  return new TypeError('Native API exchange failed.');
}

function pathOf(path: string): string {
  if (path.length > 2048 || /[\\\p{Cc}#]/u.test(path)) throw nativeFailure();
  const url = new URL(path, origin);
  if (
    !/^\/api\/(?:account|communities|public-profiles|public-media)(?:\/|\?|$)/u.test(
      path,
    ) ||
    url.origin !== origin ||
    path !== url.pathname + url.search ||
    /(?:\/\/|%|\.{2})/u.test(url.pathname)
  )
    throw nativeFailure();
  return path;
}

const requestHeaders = new Map<string, RegExp>([
  ['accept', /^text\/event-stream$/u],
  ['content-type', /^application\/json(?:;\s*charset=utf-8)?$/iu],
  ['x-hash-talk-csrf', /^[a-f0-9]{64}$/u],
  ['x-0xdmme-attachment-id', /^[a-f0-9-]{36}$/u],
  ['x-0xdmme-call-wake', /^1$/u],
  ['x-0xdmme-vault-id', /^[a-f0-9-]{36}$/u],
]);

function outgoingHeaders(input?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of new Headers(input)) {
    if (!requestHeaders.get(name)?.test(value)) throw nativeFailure();
    result[name] = value;
  }
  return result;
}

function bodyOf(input: RequestInit): string | undefined {
  if (input.body === undefined || input.body === null) return;
  if (
    typeof input.body !== 'string' ||
    input.body.length > requestBytes ||
    new TextEncoder().encode(input.body).length > requestBytes
  )
    throw nativeFailure();
  return input.body;
}

const requestOptions = new Set([
  'method',
  'headers',
  'body',
  'credentials',
  'cache',
  'redirect',
  'signal',
]);

function requestPolicy(
  input: RequestInit,
): Pick<NativeApiRequest, 'method' | 'credentials'> {
  if (Object.keys(input).some((name) => !requestOptions.has(name)))
    throw nativeFailure();
  const method = input.method ?? 'GET';
  const credentials = input.credentials ?? 'same-origin';
  if (!['GET', 'HEAD', 'POST'].includes(method)) throw nativeFailure();
  if (credentials !== 'same-origin' && credentials !== 'omit')
    throw nativeFailure();
  if (input.redirect !== undefined && input.redirect !== 'error')
    throw nativeFailure();
  return { method: method as NativeApiRequest['method'], credentials };
}

export function nativeRequest(
  path: string,
  input: RequestInit,
): NativeApiRequest {
  const policy = requestPolicy(input);
  const headers = outgoingHeaders(input.headers);
  if (
    headers['x-0xdmme-call-wake'] !== undefined &&
    (policy.method !== 'POST' || path !== '/api/account/messages/live')
  )
    throw nativeFailure();
  const body = bodyOf(input);
  if (
    body !== undefined &&
    (policy.method !== 'POST' || !headers['content-type'])
  )
    throw nativeFailure();
  return {
    id: crypto.randomUUID(),
    path: pathOf(path),
    ...policy,
    headers,
    ...(body === undefined ? {} : { body }),
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw nativeFailure();
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, names: readonly string[]): void {
  if (Object.keys(value).some((key) => !names.includes(key)))
    throw nativeFailure();
}

const responseHeaders = new Set([
  'content-type',
  'content-length',
  'cache-control',
  'retry-after',
  'x-0xdmme-server-time',
]);

function incomingHeaders(value: unknown): Headers {
  const headers = record(value);
  if (Object.keys(headers).length > responseHeaders.size) throw nativeFailure();
  const result = new Headers();
  for (const [name, text] of Object.entries(headers)) {
    if (
      !responseHeaders.has(name) ||
      typeof text !== 'string' ||
      text.length > 256
    )
      throw nativeFailure();
    if (/[\p{Cc}]/u.test(text)) throw nativeFailure();
    result.set(name, text);
  }
  return result;
}

export function responseHead(value: unknown): {
  status: number;
  headers: Headers;
  timing: NativeWireTiming | undefined;
} {
  const input = record(value);
  exact(input, ['status', 'headers', 'timing']);
  const status = input['status'];
  if (
    !Number.isInteger(status) ||
    typeof status !== 'number' ||
    status < 200 ||
    status > 599
  )
    throw nativeFailure();
  if (status >= 300 && status < 400) throw nativeFailure();
  const headers = incomingHeaders(input['headers']);
  const length = headers.get('content-length');
  if (
    length !== null &&
    (!/^(?:0|[1-9][0-9]{0,9})$/u.test(length) || Number(length) > responseBytes)
  )
    throw nativeFailure();
  const timing = readNativeWireTiming(input['timing']);
  return { status, headers, timing };
}

export function responseChunk(
  value: unknown,
  maximum: number,
): {
  done: boolean;
  bytes: Uint8Array<ArrayBuffer>;
  timing?: NativeWireTiming;
} {
  const input = record(value);
  exact(input, ['done', 'data', 'timing']);
  const data = input['data'];
  if (typeof input['done'] !== 'boolean' || typeof data !== 'string')
    throw nativeFailure();
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = decodeCanonicalBase64(data, maximum);
  } catch {
    throw nativeFailure();
  }
  if (!input['done'] && !bytes.length) throw nativeFailure();
  return {
    ...(input['timing'] === undefined
      ? {}
      : { timing: readNativeWireTiming(input['timing'])! }),
    done: input['done'],
    bytes,
  };
}
