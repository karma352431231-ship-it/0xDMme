import type { IncomingMessage } from 'node:http';
import { AccountError } from '../../shared/account/index.ts';
/** One request owns its byte budget and deadline; route policy stays with callers. */
export async function readAccountBody(
  request: IncomingMessage,
  maximum: number,
): Promise<unknown> {
  if (request.headers['content-type'] !== 'application/json')
    throw new AccountError(415, 'Use JSON.');
  const parts: Buffer[] = [];
  let size = 0;
  const timer = setTimeout(() => request.destroy(), 5000);
  timer.unref();
  try {
    for await (const value of request) {
      if (!(value instanceof Buffer))
        throw new AccountError(400, 'Invalid body.');
      size += value.length;
      if (size > maximum)
        throw new AccountError(413, 'Request exceeds the limit.');
      parts.push(value);
    }
    try {
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          Buffer.concat(parts, size),
        ),
      ) as unknown;
    } catch {
      throw new AccountError(400, 'Invalid JSON.');
    }
  } finally {
    clearTimeout(timer);
  }
}
