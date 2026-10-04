import { readWebConfiguration } from './web-configuration/index.ts';
import { Database } from './database/index.ts';
import { ObjectStore } from './object-store/index.ts';
import { createWebServer, loadWebAssets } from './web-host/index.ts';
import { AccountService, createAccountHandler } from './account/index.ts';
import { chmod } from 'node:fs/promises';
import { DeviceService } from './devices/index.ts';
import { VaultService } from './vault/index.ts';
import { MessageService } from './messages/index.ts';
import { MessageLive } from './message-live/index.ts';
import { ContactService } from './contacts/index.ts';
import {
  NotificationService,
  readPushConfiguration,
} from './notifications/index.ts';

let database: Database | undefined;

try {
  const config = readWebConfiguration(process.env);
  const assets = await loadWebAssets();
  const approvalDocument = assets.get('/wallet.html')?.content;
  const recoveryDocument = assets.get('/recovery.html')?.content;
  if (!recoveryDocument) throw new Error('Documento de recuperação ausente.');
  if (!approvalDocument) throw new Error('Documento de aprovação ausente.');
  database = new Database(config.databaseUrl, config.accountCapacityBytes);
  const objects = new ObjectStore(config.objectDirectory);
  await database.migrate();
  await objects.initialize();
  await database.vault.resumeInterrupted();
  await database.attachments.resumeInterrupted();
  const notifications = new NotificationService({
    store: database.daily,
    devices: database.devices,
    config: readPushConfiguration(process.env),
  });
  const messages = new MessageService(
    database,
    database.devices,
    objects,
    notifications,
  );
  await messages.cleanAttachments();
  if (!(await database.healthy())) throw new Error('Banco indisponível.');
  const host = createWebServer({
    origin: config.origin,
    assets,
    database,
    objects,
    account: createAccountHandler({
      live: new MessageLive(database.changes),
      notifications,
      contacts: new ContactService(database.contacts, database.devices),
      messages,
      devices: new DeviceService(database.devices, config.origin),
      vault: new VaultService({
        store: database.vault,
        devices: database.devices,
        objects,
      }),
      service: new AccountService({
        store: database.authentication,
        origin: config.origin,
      }),
      origin: config.origin,
      approvalDocument,
      recoveryDocument,
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
  notifications.start();
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 8_000);
    deadline.unref();
    void host
      .close()
      .then(() => notifications.close())
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
