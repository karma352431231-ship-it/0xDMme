import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { startProbe } from './probe-host/index.ts';
import { mobileOrigin, serveMobileCertificate } from './probe-mobile/index.ts';
import { onlyKeys, parseObject, text } from '../shared/crypto-probe/index.ts';
import type { Server } from 'node:http';

let laboratory: Server | undefined;
let bootstrap: Server | undefined;

function shutdown(): void {
  for (const server of [laboratory, bootstrap]) {
    server?.close();
    server?.closeAllConnections();
  }
}

try {
  const root = new URL('../../.local/mobile-tls/', import.meta.url);
  const config = parseObject(
    await readFile(
      new URL('../../.local/mobile-probe.json', import.meta.url),
      'utf8',
    ),
  );
  onlyKeys(config, ['address']);
  const [cert, key, certificate] = await Promise.all([
    readFile(new URL('server.pem', root)),
    readFile(new URL('server.key', root)),
    readFile(new URL('hash-talk-test.cer', root)),
  ]);
  const mobile = {
    address: text(config.address, 15),
    cert,
    key,
    accessToken: randomBytes(32).toString('base64url'),
  };
  const origin = mobileOrigin(45102, mobile);
  laboratory = startProbe(45102, mobile);
  await once(laboratory, 'listening');
  bootstrap = serveMobileCertificate(mobile.address, certificate);
  await once(bootstrap, 'listening');
  // Qualquer erro de listener encerra ambos; não deixar uma sessão parcial ativa.
  for (const server of [laboratory, bootstrap]) {
    server.on('error', () => {
      process.exitCode = 1;
      shutdown();
    });
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  setTimeout(shutdown, 2 * 60 * 60 * 1000).unref();
  process.stdout.write(
    `Certificado público: http://${mobile.address}:45103/hash-talk-test.cer\n`,
  );
  process.stdout.write(
    `Entrada temporária: ${origin}/?access=${mobile.accessToken}\n`,
  );
} catch {
  shutdown();
  process.stderr.write(
    'Não foi possível iniciar o ensaio HTTPS. Confira a configuração e os certificados locais.\n',
  );
  process.exitCode = 1;
}
