import { readWebConfiguration } from './web-configuration/index.ts';
import { Database } from './database/index.ts';
import { CommunityMediaService } from './community-media/index.ts';
import { ObjectStore } from './object-store/index.ts';
import { createWebServer, loadWebAssets } from './web-host/index.ts';
import { AccountService, createAccountHandler } from './account/index.ts';
import {
  PublicProfileService,
  createPublicProfileHandler,
} from './public-profile/index.ts';
import {
  CommunityService,
  createCommunityHandler,
} from './communities/index.ts';
import { chmod } from 'node:fs/promises';
import { DeviceService } from './devices/index.ts';
import { VaultService } from './vault/index.ts';
import { MessageService } from './messages/index.ts';
import { MessageLive } from './message-live/index.ts';
import { ContactService } from './contacts/index.ts';
import { CallService, readTurnConfiguration } from './calls/index.ts';
import {
  RepresentativeService,
  DnsDomainResolver,
} from './representatives/index.ts';
import { NotificationService } from './notifications/index.ts';
import {
  readPushClientConfiguration,
  dispatchPush,
} from './push-sender/index.ts';

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
  await database.groupMedia.resumeInterrupted();
  await database.statusMedia.resumeInterrupted();
  const push = readPushClientConfiguration(process.env);
  const notifications = new NotificationService({
    store: database.daily,
    devices: database.devices,
    config: push,
    ...(push
      ? {
          send: (subscription, _config, delivery) =>
            dispatchPush(push, subscription, delivery),
        }
      : {}),
  });
  const messages = new MessageService(database, database.devices, objects, {
    notifications,
    representatives: new RepresentativeService(
      database.representatives,
      new DnsDomainResolver(),
      config.origin,
    ),
  });
  await messages.cleanAttachments();
  if (!(await database.healthy())) throw new Error('Banco indisponível.');
  const calls = new CallService({
    store: database.calls,
    messages,
    changes: database.changes,
    config: readTurnConfiguration(process.env),
    ...(push ? { wake: (invitation) => notifications.wake(invitation) } : {}),
  });
  notifications.bindCalls((session, directory) =>
    calls.incoming(session, directory),
  );
  const publicProfiles = new PublicProfileService(
    database.publicProfiles,
    database.devices,
  );
  const communityMedia = new CommunityMediaService({
    store: database.communityMedia,
    directory: config.objectDirectory,
    environment: process.env,
  });
  await communityMedia.initialize();
  const communities = new CommunityService(
    database.communities,
    database.devices,
    database.communityPosts,
    { discovery: database.communityDiscovery, media: communityMedia },
  );
  const host = createWebServer({
    origin: config.origin,
    assets,
    database,
    objects,
    publicProfiles: createPublicProfileHandler((handle) =>
      publicProfiles.read(handle),
    ),
    communities: createCommunityHandler({
      read: (id) => communities.read(id),
      list: (after) => communities.list(after),
      feed: (filter, after) => communities.feed(filter, after),
      explore: (filter, after) => communities.explore(filter, after),
      post: (id, post) => communities.post(id, post),
      postPage: (id, after, tag) => communities.postPage(id, after, tag),
      replies: (id, parent, after) => communities.replies(id, parent, after),
      tags: (id, after) => communities.tags(id, after),
    }),
    account: createAccountHandler({
      communities,
      publicProfiles,
      calls,
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
  messages.startMaintenance();
  communityMedia.start();
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 8_000);
    deadline.unref();
    void host
      .close()
      .then(() => communityMedia.close())
      .then(() => messages.close())
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
