import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { Database } from '../server/database/index.ts';
import { PublicModerationOperator } from '../server/public-moderation/index.ts';
import { AccountError, keys, object, uuid } from '../shared/account/index.ts';
import { readOperatorConfiguration } from './moderation-operator-access.ts';

async function decision(): Promise<{
  id: string;
  verdict: 'allow' | 'reject';
  reason: string;
  confirmsPermitted: boolean;
}> {
  let text = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    text += String(chunk);
    if (Buffer.byteLength(text) > 8192) throw new Error('Decisão excedida.');
  }
  const data = object(JSON.parse(text) as unknown);
  keys(data, ['id', 'verdict', 'reason', 'confirmsPermitted']);
  if (
    (data['verdict'] !== 'allow' && data['verdict'] !== 'reject') ||
    typeof data['reason'] !== 'string' ||
    typeof data['confirmsPermitted'] !== 'boolean'
  )
    throw new Error('Decisão inválida.');
  return {
    id: uuid(data['id']),
    verdict: data['verdict'],
    reason: data['reason'],
    confirmsPermitted: data['confirmsPermitted'],
  };
}
function headers(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
}
async function preview(
  operator: PublicModerationOperator,
  id: string,
): Promise<void> {
  const secret = randomBytes(32).toString('hex'),
    path = `/${secret}`;
  const type = (await operator.preview(id)).type;
  const element =
    type === 'video/mp4'
      ? `<video controls src="${path}/file"></video>`
      : `<img src="${path}/file" alt="Candidato de imagem">`;
  const pending = new Set<Promise<void>>();
  let busy = false;
  const server = createServer((request, response) => {
    headers(response);
    if (
      request.method !== 'GET' ||
      request.headers.origin ||
      request.headers['sec-fetch-site'] === 'cross-site' ||
      ![path, `${path}/file`].includes(request.url ?? '')
    ) {
      response.writeHead(404).end();
      return;
    }
    if (busy) {
      response.writeHead(503).end();
      return;
    }
    if (request.url === path) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(
        `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>0xDMme — revisão restrita</title><h1>Revisão excepcional</h1><p>Verifique a mídia completa. Nudez artística em pinturas é permitida, inclusive em pinturas digitais/IA que sejam de fato pinturas. Atos sexuais explícitos continuam proibidos. Fotos e desenhos fora dessa exceção não permitem genitais/seios femininos expostos. Decida pelo comando restrito, após conferir a contestação.</p>${element}<p>A prévia encerra em até cinco minutos.</p></html>`,
      );
      return;
    }
    busy = true;
    const job = operator
      .preview(id)
      .then((candidate) => {
        response.setHeader('Content-Type', candidate.type);
        response.setHeader('Content-Length', candidate.bytes.length);
        response.end(candidate.bytes);
      })
      .catch((error: unknown) => {
        response
          .writeHead(error instanceof AccountError ? error.status : 503)
          .end();
      })
      .finally(() => {
        busy = false;
        pending.delete(job);
      });
    pending.add(job);
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 4;
  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Prévia indisponível.');
  process.stdout.write(
    `Prévia privada por cinco minutos: http://127.0.0.1:${address.port}${path}\n`,
  );
  await new Promise<void>((accept) => {
    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      clearTimeout(timer);
      server.closeAllConnections();
      server.close(() => {
        process.off('SIGINT', close);
        process.off('SIGTERM', close);
        void Promise.allSettled(pending).then(() => accept());
      });
    };
    const timer = setTimeout(close, 300_000);
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  });
}
let database: Database | undefined;
try {
  const [command, argument, ...extra] = process.argv.slice(2);
  if (extra.length || !['list', 'preview', 'decide'].includes(command ?? ''))
    throw new Error('Use list [cursor], preview ID ou decide < decisão.json.');
  const config = await readOperatorConfiguration(process.cwd());
  database = new Database(config.databaseUrl);
  const operator = new PublicModerationOperator(
    database,
    config.objectDirectory,
  );
  if (command === 'preview') await preview(operator, uuid(argument));
  else if (command === 'list')
    process.stdout.write(
      JSON.stringify(await operator.list(argument ? uuid(argument) : null)) +
        '\n',
    );
  else {
    if (argument)
      throw new Error('Envie a decisão somente pela entrada padrão.');
    process.stdout.write(
      JSON.stringify(await operator.review(await decision())) + '\n',
    );
  }
} catch (error: unknown) {
  process.stderr.write(
    error instanceof AccountError
      ? `${error.message}\n`
      : 'Ferramenta restrita indisponível; confira permissões, configuração e argumento.\n',
  );
  process.exitCode = 1;
} finally {
  await database?.close();
}
