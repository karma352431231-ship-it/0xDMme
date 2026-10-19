import { t } from '../../shared/i18n/index.ts';
import { AccountError } from '../../shared/account/index.ts';

export type ApiFailure =
  'http' | 'non-json' | 'invalid-json' | 'network' | 'timeout' | 'cancelled';
type ResponseType = 'json' | 'html' | 'other' | 'missing';
const requestSignals = new WeakMap<Response, AbortSignal>();

function operationLabel(operation: string): string {
  // Callers supply a fixed operation name, never a URL, handle or payload.
  return operation.length <= 80 && /^[a-z]+(?:[/-][a-z]+)*$/u.test(operation)
    ? operation
    : 'api';
}
function responseType(response: Response): ResponseType {
  const type = response.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase();
  if (!type) return 'missing';
  if (type === 'application/json') return 'json';
  return type === 'text/html' ? 'html' : 'other';
}
function statusMessage(status: number): string {
  switch (status) {
    case 401:
      return t('Session ended or sign-in rejected.');
    case 403:
      return t('Request has no current authorization.');
    case 413:
      return t('Request exceeds the permitted size.');
    case 429:
      return t('Too many server requests. Wait and try again.');
    case 502:
      return t('Failed to communicate with the service.');
    case 503:
      return t('Service unavailable. Try again.');
    case 504:
      return t('The service took too long to respond. Try again.');
    default:
      return t('The server rejected the request.');
  }
}
function failureMessage(failure: ApiFailure): string {
  switch (failure) {
    case 'network':
      return t('Could not connect to the server.');
    case 'timeout':
      return t('The request timed out.');
    case 'cancelled':
      return t('The request was interrupted.');
    default:
      return t('Invalid server response.');
  }
}
export class ApiResponseError extends AccountError {
  readonly operation: string;
  readonly reason: string;
  readonly failure: ApiFailure;
  readonly responseType: ResponseType;
  constructor(input: {
    operation: string;
    status: number;
    failure: ApiFailure;
    responseType?: ResponseType;
    message?: string | undefined;
  }) {
    const operation = operationLabel(input.operation);
    const type = input.responseType ?? 'missing';
    const reason =
      input.message ??
      (input.status >= 400
        ? statusMessage(input.status)
        : failureMessage(input.failure));
    const http = input.status
      ? t('HTTP {0}', [input.status])
      : t('no HTTP response');
    super(
      input.status,
      t('{0} [{1} · {2} · {3} · {4}]', [
        reason,
        operation,
        http,
        input.failure,
        type,
      ]),
    );
    this.operation = operation;
    this.reason = reason;
    this.failure = input.failure;
    this.responseType = type;
  }
}
function transportFailure(
  error: unknown,
  signal?: AbortSignal | null,
): ApiFailure {
  const reason: unknown = signal?.aborted ? signal.reason : error;
  if (reason instanceof Error && reason.name === 'TimeoutError')
    return 'timeout';
  if (
    signal?.aborted ||
    (reason instanceof Error && reason.name === 'AbortError')
  )
    return 'cancelled';
  return 'network';
}
/** Preserve request options and lifecycle; failures never retry or expose a body/URL. */
export async function fetchApi(
  operation: string,
  path: string,
  options: RequestInit,
): Promise<Response> {
  try {
    const response = await fetch(path, options);
    if (options.signal) requestSignals.set(response, options.signal);
    return response;
  } catch (error: unknown) {
    throw new ApiResponseError({
      operation,
      status: 0,
      failure: transportFailure(error, options.signal),
    });
  }
}
function serverMessage(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('error' in value))
    return;
  const error: unknown = value.error;
  if (typeof error !== 'string' || !error.trim()) return;
  return error
    .replace(/\p{Cc}/gu, ' ')
    .trim()
    .slice(0, 200);
}
/** Status and a coarse content type survive HTML, empty and malformed responses.
 * JSON error messages retain the existing server contract; bodies are never logged. */
export async function readApiJson(
  response: Response,
  operation: string,
): Promise<unknown> {
  const type = responseType(response);
  if (type !== 'json') {
    requestSignals.delete(response);
    await response.body?.cancel().catch(() => undefined);
    throw new ApiResponseError({
      operation,
      status: response.status,
      failure: 'non-json',
      responseType: type,
    });
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch (error: unknown) {
    throw new ApiResponseError({
      operation,
      status: response.status,
      responseType: type,
      failure:
        error instanceof SyntaxError
          ? 'invalid-json'
          : transportFailure(error, requestSignals.get(response)),
    });
  } finally {
    requestSignals.delete(response);
  }
  if (!response.ok)
    throw new ApiResponseError({
      operation,
      status: response.status,
      failure: 'http',
      responseType: type,
      message: serverMessage(data),
    });
  return data;
}
