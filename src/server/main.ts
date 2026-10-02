import { readWebConfiguration } from './web-configuration/index.ts';
import { Database } from './database/index.ts';
import { ObjectStore } from './object-store/index.ts';
import { createWebServer, loadWebAssets } from './web-host/index.ts';
import { AccountService, createAccountHandler } from './account/index.ts';
import { chmod } from 'node:fs/promises';

let database: Database | undefined;

try {
  const config = readWebConfiguration(process.env);
  const assets = await loadWebAssets();
  const approvalDocument = assets.get('/wallet.html')?.content;
  if (!approvalDocument) throw new Error('Documento de aprovação ausente.');
  database = new Database(config.databaseUrl);
  const objects = new ObjectStore(config.objectDirectory);
  await database.migrate();
  await objects.initialize();
  if (!(await database.healthy())) throw new Error('Banco indisponível.');
  const host = createWebServer({
    origin: config.origin,
    assets,
    database,
    objects,
    account: createAccountHandler({
      service: new AccountService({
        store: database.authentication,
        origin: config.origin,
        capacity: config.accountCapacityBytes,
      }),
      origin: config.origin,
      approvalDocument,
      ...(config.walletConnectProjectId
        ? { walletConnectProjectId: config.walletConnectProjectId }
        : {}),
    }),
  });
  await new Promise<void>((resolve, reject) => {
    host.server.once('error', reject);
    const listening = () => {
      host.server.removeListener('error', reject);
      resolve();
    };
    if (config.socketPath) host.server.listen(config.socketPath, listening);
    else host.server.listen(config.port, '127.0.0.1', listening);
  });
  // Nginx connects through the socket; the private network namespace exposes no host TCP port.
  if (config.socketPath) await chmod(config.socketPath, 0o666);
  host.server.on('error', () => {
    process.stderr.write('Falha no serviço web local.\n');
    process.exitCode = 1;
    shutdown();
  });
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 8_000);
    deadline.unref();
    void host
      .close()
      .then(() => database?.close())
      .then(() => {
        clearTimeout(deadline);
      })
      .catch(() => {
        process.stderr.write('Falha no desligamento local.\n');
        process.exitCode = 1;
      });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.stdout.write(
    `0xDMme: ambiente ${config.profile} em ${config.origin}. Use somente dados fictícios.\n`,
  );
} catch {
  await database?.close();
  process.stderr.write(
    'Base local não iniciada. Confira configuração, build e banco exclusivo do 0xDMme.\n',
  );
  process.exitCode = 1;
}
