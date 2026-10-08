import type { IncomingMessage } from 'node:http';
import { AccountError } from '../../shared/account/index.ts';
import { postObservations } from '../../shared/community-views/index.ts';

export async function viewRequest(
  request: IncomingMessage,
  origin: string,
): Promise<unknown> {
  if (request.method !== 'POST')
    throw new AccountError(405, 'Método inválido.');
  if (request.headers.origin !== origin)
    throw new AccountError(403, 'Origem de visualização inválida.');
  if (request.headers['content-type'] !== 'application/json')
    throw new AccountError(415, 'Use JSON.');
  const parts: Buffer[] = [];
  let size = 0;
  const timeout = setTimeout(() => request.destroy(), 5000);
  timeout.unref();
  try {
    for await (const value of request) {
      if (!(value instanceof Buffer))
        throw new AccountError(400, 'Corpo inválido.');
      size += value.length;
      if (size > 8192)
        throw new AccountError(413, 'Lote de visualizações excedido.');
      parts.push(value);
    }
    let input: unknown;
    try {
      input = JSON.parse(Buffer.concat(parts).toString('utf8'));
    } catch {
      throw new AccountError(400, 'JSON inválido.');
    }
    return { items: postObservations(input) };
  } finally {
    clearTimeout(timeout);
  }
}
