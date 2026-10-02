import { Database } from './database/index.ts';
import { AccountService, createAccountHandler } from './account/index.ts';
import { createWebServer, loadWebAssets } from './web-host/index.ts';
import { readWebConfiguration } from './web-configuration/index.ts';
import {
  readMobileWebConfiguration,
  recordMobileWebEntry,
} from './web-mobile/index.ts';

let database: Database | undefined;
let shutdown: (() => Promise<void>) | undefined;
try {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Mobile temporário exige banco de teste exclusivo.');
  const mobile = await readMobileWebConfiguration();
  const assets = await loadWebAssets();
  const approvalDocument = assets.get('/wallet.html')?.content;
  if (!approvalDocument) throw new Error('Documento de aprovação ausente.');
  database = new Database(config.databaseUrl);
  await database.migrate();
  const host = createWebServer({
    ...mobile,
    database,
    assets,
    objects: { healthy: () => Promise.resolve(false) }, // Storage/photo envelopes use SQL; no public object endpoint.
    account: createAccountHandler({
      origin: mobile.origin,
      approvalDocument,
      service: new AccountService({
        store: database.authentication,
        origin: mobile.origin,
        capacity: config.accountCapacityBytes,
      }),
    }),
  });
  shutdown = async () => {
    await host.close();
    await database?.close();
  };
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 8000);
    deadline.unref();
    clearTimeout(lifetime);
    void host
      .close()
      .then(() => database?.close())
      .then(() => clearTimeout(deadline))
      .catch(() => {
        process.exitCode = 1;
      });
  };
  const lifetime = setTimeout(close, 60 * 60 * 1000);
  lifetime.unref();
  await new Promise<void>((resolve, reject) => {
    host.server.once('error', reject);
    host.server.listen(mobile.port, mobile.address, resolve);
  });
  host.server.on('error', () => {
    process.exitCode = 1;
    close();
  });
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  await recordMobileWebEntry(mobile.origin);
  process.stdout.write(
    'Base mobile temporária iniciada; acesso em .local/WEB_MOBILE_ACESSO.md.\n',
  );
} catch {
  if (shutdown) await shutdown();
  else await database?.close();
  process.stderr.write(
    'Base mobile indisponível. Confira banco de teste e certificado/configuração privada.\n',
  );
  process.exitCode = 1;
}
