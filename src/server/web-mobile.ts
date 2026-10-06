import { Database } from './database/index.ts';
import { AccountService, createAccountHandler } from './account/index.ts';
import {
  PublicProfileService,
  createPublicProfileHandler,
} from './public-profile/index.ts';
import {
  CommunityService,
  createCommunityHandler,
} from './communities/index.ts';
import { createWebServer, loadWebAssets } from './web-host/index.ts';
import { readWebConfiguration } from './web-configuration/index.ts';
import { DeviceService } from './devices/index.ts';
import { VaultService } from './vault/index.ts';
import { ObjectStore } from './object-store/index.ts';
import { MessageService } from './messages/index.ts';
import { MessageLive } from './message-live/index.ts';
import { ContactService } from './contacts/index.ts';
import {
  RepresentativeService,
  DnsDomainResolver,
} from './representatives/index.ts';
import {
  NotificationService,
  readPushConfiguration,
} from './notifications/index.ts';
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
  const recoveryDocument = assets.get('/recovery.html')?.content;
  if (!recoveryDocument) throw new Error('Documento de recuperação ausente.');
  if (!approvalDocument) throw new Error('Documento de aprovação ausente.');
  database = new Database(config.databaseUrl, config.accountCapacityBytes);
  await database.migrate();
  const objects = new ObjectStore(config.objectDirectory);
  await objects.initialize();
  await database.groupMedia.resumeInterrupted();
  await database.statusMedia.resumeInterrupted();
  const notifications = new NotificationService({
    store: database.daily,
    devices: database.devices,
    config: readPushConfiguration(process.env),
  });
  const messages = new MessageService(database, database.devices, objects, {
    notifications,
    representatives: new RepresentativeService(
      database.representatives,
      new DnsDomainResolver(),
      mobile.origin,
    ),
  });
  await messages.cleanAttachments();
  const publicProfiles = new PublicProfileService(
    database.publicProfiles,
    database.devices,
  );
  const communities = new CommunityService(
    database.communities,
    database.devices,
    database.communityPosts,
  );
  const host = createWebServer({
    ...mobile,
    database,
    assets,
    objects,
    publicProfiles: createPublicProfileHandler((handle) =>
      publicProfiles.read(handle),
    ),
    communities: createCommunityHandler({
      read: (id) => communities.read(id),
      list: (after) => communities.list(after),
      post: (id, post) => communities.post(id, post),
      postPage: (id, after, tag) => communities.postPage(id, after, tag),
      replies: (id, parent, after) => communities.replies(id, parent, after),
      tags: (id, after) => communities.tags(id, after),
    }),
    account: createAccountHandler({
      communities,
      publicProfiles,
      live: new MessageLive(database.changes),
      contacts: new ContactService(database.contacts, database.devices),
      messages,
      notifications,
      devices: new DeviceService(database.devices, mobile.origin),
      vault: new VaultService({
        store: database.vault,
        devices: database.devices,
        objects,
      }),
      origin: mobile.origin,
      approvalDocument,
      recoveryDocument,
      service: new AccountService({
        store: database.authentication,
        origin: mobile.origin,
      }),
    }),
  });
  shutdown = async () => {
    await host.close();
    await messages.close();
    await notifications.close();
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
      .then(() => messages.close())
      .then(() => notifications.close())
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
  notifications.start();
  messages.startMaintenance();
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
