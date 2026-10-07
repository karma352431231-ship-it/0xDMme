import { createConnection } from 'node:net';
import { AccountError, object } from '../../shared/account/index.ts';

export interface MediaProcessRequest {
  binary: 'ffmpeg' | 'ffprobe';
  args: string[];
  maximumBytes: number;
}

export async function isolatedMediaProcess(
  path: string,
  request: MediaProcessRequest | null,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const payload = JSON.stringify(
    request
      ? {
          operation: 'process',
          binary: request.binary,
          args: request.args,
          maximumBytes: request.maximumBytes,
        }
      : { operation: 'health' },
  );
  if (Buffer.byteLength(payload) > 65_536)
    throw new AccountError(422, 'Pedido de preparação excede o orçamento.');
  return new Promise<string>((resolve, reject) => {
    const socket = createConnection(path);
    socket.setEncoding('utf8');
    let result = '',
      settled = false;
    const fail = (): void => {
      if (settled) return;
      settled = true;
      reject(new AccountError(503, 'Processador isolado indisponível.'));
      socket.destroy();
    };
    const abort = (): void => fail();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) fail();
    socket.setTimeout(365_000, fail);
    socket.once('connect', () => socket.end(payload + '\n'));
    socket.on('data', (chunk: string) => {
      result += chunk;
      if (Buffer.byteLength(result) > 262_144) fail();
    });
    socket.once('error', fail);
    socket.once('end', () => {
      if (settled) return;
      try {
        const response = object(JSON.parse(result) as unknown);
        if (response['ok'] !== true || typeof response['output'] !== 'string')
          throw new Error('Preparação falhou.');
        settled = true;
        resolve(response['output']);
      } catch {
        fail();
      }
    });
    socket.once('close', () => {
      signal.removeEventListener('abort', abort);
      if (!settled) fail();
    });
  });
}
