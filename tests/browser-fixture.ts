import { createRuntimeContentCapacity } from '../src/server/storage-capacity/index.ts';
import {
  PublicMediaService,
  createPublicMediaHandler,
} from '../src/server/public-media/index.ts';
import { build } from 'esbuild';
import { createHash, randomBytes } from 'node:crypto';
import { Database } from '../src/server/database/index.ts';
import { embeddedBackground } from '../src/server/background/index.ts';
import {
  AccountService,
  createAccountHandler,
} from '../src/server/account/index.ts';
import {
  createWebServer,
  loadWebAssets,
} from '../src/server/web-host/index.ts';
import { readWebConfiguration } from '../src/server/web-configuration/index.ts';
import { DeviceService } from '../src/server/devices/index.ts';
import {
  PublicProfileService,
  createPublicProfileHandler,
} from '../src/server/public-profile/index.ts';
import {
  CommunityService,
  createCommunityHandler,
} from '../src/server/communities/index.ts';
import { VaultService } from '../src/server/vault/index.ts';
import { CommunityMediaService } from '../src/server/community-media/index.ts';
import { ObjectStore } from '../src/server/object-store/index.ts';
import { MessageService } from '../src/server/messages/index.ts';
import { MessageLive } from '../src/server/message-live/index.ts';
import { RepresentativeService } from '../src/server/representatives/index.ts';
import { ContactService } from '../src/server/contacts/index.ts';
import {
  CallService,
  readTurnConfiguration,
} from '../src/server/calls/index.ts';
import { NotificationService } from '../src/server/notifications/index.ts';
import { emojiAsset } from '../src/tools/frontend-emoji.ts';
import { localizationPlugin } from '../src/tools/frontend-localization.ts';
import type { WebAsset } from '../src/server/web-host/index.ts';

// Explicit manual-browser fixture, excluded from production build/entry point.
// Isolated test database and fixed loopback origin; never accepts real wallet keys.
const config = readWebConfiguration(process.env);
if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
  throw new Error('Fixture exige banco de teste exclusivo.');
const fixturePort = Number(process.env['HASH_TALK_FIXTURE_PORT'] ?? 45111);
if (
  !Number.isInteger(fixturePort) ||
  fixturePort < 45111 ||
  fixturePort > 45119
)
  throw new Error('Porta de fixture fora do intervalo exclusivo.');
const fixtureHost = process.env['HASH_TALK_FIXTURE_HOST'] ?? '127.0.0.1';
if (!['127.0.0.1', 'localhost'].includes(fixtureHost))
  throw new Error('A fixture só aceita origem de loopback.');
const origin = `http://${fixtureHost}:${fixturePort}`;
function syntheticSeed(variable: string): string {
  const seed = process.env[variable] ?? `0x${randomBytes(32).toString('hex')}`;
  if (!/^0x[a-f0-9]{64}$/u.test(seed))
    throw new Error('Invalid synthetic fixture seed. Never use a real key.');
  return seed;
}
const fixtureSeed = syntheticSeed('HASH_TALK_FIXTURE_SYNTHETIC_SEED');
const pairSeed = process.env['HASH_TALK_FIXTURE_PAIR_PORT']
  ? syntheticSeed('HASH_TALK_FIXTURE_PAIR_SYNTHETIC_SEED')
  : null;
// Synthetic moderation inventory is confined to this loopback-only browser fixture.
const database = new Database(
  config.databaseUrl,
  await createRuntimeContentCapacity(config.contentCapacity),
  [{ hash: 'f'.repeat(64), runtime: 'browser-fixture-synthetic' }],
);
await database.migrate();
const objects = new ObjectStore(config.objectDirectory);
await objects.initialize();
const assets = new Map(await loadWebAssets());
if (process.env['HASH_TALK_FIXTURE_EMOJI_CONTROLS'] === '1')
  await emojiFixture(assets);
const fixtureOwner = process.env['HASH_TALK_FIXTURE_OWNER'];
if (fixtureOwner) {
  if (!/^[a-f0-9]{48}$/u.test(fixtureOwner))
    throw new Error('Invalid synthetic fixture ownership marker.');
  assets.set(`/fixture-owner-${fixtureOwner}.txt`, {
    type: 'text/plain; charset=utf-8',
    content: new TextEncoder().encode(fixtureOwner),
  });
}
const root = assets.get('/');
if (!root) throw new Error('Build missing.');
const html = new TextDecoder().decode(root.content);
const app = html.match(/src="(\/app-[a-f0-9]+\.js)"/u)?.[1];
if (!app) throw new Error('Build de app ausente.');
async function walletAsset(seed: string): Promise<WebAsset> {
  const bundle = await build({
    entryPoints: ['tests/fixtures/wallet-browser.ts'],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    minify: true,
    write: false,
    define: {
      SYNTHETIC_CONTEXT_WALLETS:
        process.env['HASH_TALK_FIXTURE_CONTEXT_WALLETS'] === '1'
          ? 'true'
          : 'false',
      SYNTHETIC_VAULT_CONTROLS:
        process.env['HASH_TALK_FIXTURE_VAULT_CONTROLS'] === '1'
          ? 'true'
          : 'false',
      SYNTHETIC_FIXTURE_SEED: JSON.stringify(seed),
      SYNTHETIC_QR_CAMERA:
        process.env['HASH_TALK_FIXTURE_QR_CAMERA'] === '1' ? 'true' : 'false',
      SYNTHETIC_RECOVERY_CONTROLS:
        process.env['HASH_TALK_FIXTURE_RECOVERY_CONTROLS'] === '1'
          ? 'true'
          : 'false',
    },
  });
  const script = bundle.outputFiles[0]?.contents;
  if (!script) throw new Error('Fixture ausente.');
  return {
    type: 'text/javascript; charset=utf-8',
    content: script,
  };
}
// A static URL plus immutable asset caching would reuse a previous synthetic wallet.
const fixtureWallet = await walletAsset(fixtureSeed);
const fixtureWalletPath = `/fixture-wallet-${createHash('sha256').update(fixtureWallet.content).digest('hex').slice(0, 16)}.js`;
assets.set(fixtureWalletPath, fixtureWallet);
for (const path of ['/', '/wallet.html', '/recovery.html']) {
  const entry = assets.get(path);
  if (!entry) throw new Error('Página de teste ausente.');
  const pageHtml = new TextDecoder().decode(entry.content);
  const pageScript = pageHtml.match(
    /src="(\/(?:app|recovery-return)-[a-f0-9]+\.js)"/u,
  )?.[1];
  if (!pageScript) throw new Error('Script de teste ausente.');
  assets.set(path, {
    ...entry,
    content: new TextEncoder().encode(
      pageHtml
        .replace(
          '<html lang="en">',
          `<html lang="en" data-test-app="${pageScript}">`,
        )
        .replace(`src="${pageScript}"`, `src="${fixtureWalletPath}"`)
        .replace(
          '</body>',
          '<p data-fixture-warning>ISOLATED TEST: synthetic wallet, no funds, no real data.</p></body>',
        ),
    ),
  });
}
const notifications = new NotificationService({
  store: database.daily,
  devices: database.devices,
  config: null,
});
const live = new MessageLive(database.changes);
const messages = new MessageService(database, database.devices, objects, {
  representatives: new RepresentativeService(
    database.representatives,
    { matches: () => Promise.resolve(false) },
    origin,
  ),
  notifications,
});
const calls = new CallService({
  store: database.calls,
  messages,
  changes: database.changes,
  config: readTurnConfiguration(process.env),
});
const communityMedia = new CommunityMediaService({
  store: database.communityMedia,
  directory: config.objectDirectory,
  environment: process.env,
});
await communityMedia.initialize();
const background = await embeddedBackground({
  db: database,
  directory: config.objectDirectory,
  origin,
});
await database.workSignals.start();
background.start();
function fixtureServer(
  testOrigin: string,
  testAssets: ReadonlyMap<string, WebAsset>,
) {
  const publicProfiles = new PublicProfileService(
    database.publicProfiles,
    database.devices,
    database.profileSocial,
  );
  const communities = new CommunityService(
    database.communities,
    database.devices,
    database.communityPosts,
    { discovery: database.communityDiscovery, media: communityMedia },
  );
  return createWebServer({
    origin: testOrigin,
    assets: testAssets,
    database,
    objects,
    publicProfiles: createPublicProfileHandler(
      (handle) => publicProfiles.read(handle),
      publicProfiles,
    ),
    publicMedia: createPublicMediaHandler(
      new PublicMediaService(
        {
          profiles: database.publicProfiles,
          communities: database.communities,
          media: database.communityMedia,
        },
        config.objectDirectory,
      ),
    ),
    communities: createCommunityHandler({
      rankingSignals: database.workSignals,
      origin: testOrigin,
      views: (input) => database.communityViews.observe(input),
      accounts: (period, after, order) =>
        database.communityRanking.accountsPage(period, after, {
          order: order ?? 'trending',
        }),
      read: (id) => communities.read(id),
      readAddress: (slug) => communities.readAddress(slug),
      followers: (id, after) => communities.followerPage(id, after),
      list: (after) => communities.list(after),
      suggestions: (query) => communities.suggestions(query),
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
      live,
      contacts: new ContactService(database.contacts, database.devices),
      messages,
      notifications,
      devices: new DeviceService(database.devices, testOrigin),
      ...fixtureDocuments(),
      vault: new VaultService({
        store: database.vault,
        devices: database.devices,
        objects,
      }),
      origin: testOrigin,
      service: new AccountService({
        store: database.authentication,
        origin: testOrigin,
      }),
    }),
  });
}
const host = fixtureServer(origin, assets);
function fixtureDocuments(): {
  approvalDocument: Uint8Array;
  recoveryDocument: Uint8Array;
} {
  const approvalDocument = assets.get('/wallet.html')?.content;
  const recoveryDocument = assets.get('/recovery.html')?.content;
  if (!approvalDocument || !recoveryDocument)
    throw new Error('Documentos de teste ausentes.');
  return { approvalDocument, recoveryDocument };
}
async function emojiFixture(assets: Map<string, WebAsset>): Promise<void> {
  const catalogPath = [...assets.keys()].find((path) =>
    /^\/emoji-catalog-[a-f0-9]+\.js$/u.test(path),
  );
  if (!catalogPath) throw new Error('Catálogo de emojis do build ausente.');
  const result = await build({
    entryPoints: ['tests/fixtures/emoji-browser.ts'],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    write: false,
    define: {
      EMOJI_ASSET_URL: JSON.stringify(`/${emojiAsset}`),
    },
    plugins: [localizationPlugin(undefined, catalogPath)],
  });
  const script = result.outputFiles[0]?.contents;
  if (!script) throw new Error('Fixture de emojis ausente.');
  const style = [...assets.keys()].find((path) =>
    /^\/app-[a-f0-9]+\.css$/u.test(path),
  );
  if (!style) throw new Error('Estilo de teste ausente.');
  assets.set('/emoji-test.js', {
    content: script,
    type: 'text/javascript; charset=utf-8',
  });
  assets.set('/emoji-test.html', {
    content: new TextEncoder().encode(
      `<html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${style}"><script type="module" src="/emoji-test.js"></script><title>Emojis — teste sintético</title><main></main></html>`,
    ),
    type: 'text/html; charset=utf-8',
  });
}
await new Promise<void>((resolve, reject) => {
  host.server.once('error', reject);
  host.server.listen(fixturePort, '127.0.0.1', resolve);
});
let closing = false;
const hosts = [host];
if (process.env['HASH_TALK_FIXTURE_PAIR_PORT']) {
  const port = Number(process.env['HASH_TALK_FIXTURE_PAIR_PORT']);
  if (
    !Number.isInteger(port) ||
    port < 45111 ||
    port > 45119 ||
    port === fixturePort
  )
    throw new Error('Porta pareada fora do intervalo exclusivo.');
  const otherAssets = new Map(assets);
  otherAssets.set(fixtureWalletPath, await walletAsset(pairSeed!));
  const hostname = fixtureHost === 'localhost' ? '127.0.0.1' : 'localhost';
  const other = fixtureServer(`http://${hostname}:${port}`, otherAssets);
  await new Promise<void>((resolve, reject) => {
    other.server.once('error', reject);
    other.server.listen(port, '127.0.0.1', resolve);
  });
  hosts.push(other);
}
const requestCounts = new Map<string, number>();
if (process.env['HASH_TALK_FIXTURE_REQUEST_COUNTS'] === '1')
  for (const value of hosts)
    value.server.on('request', (request, response) => {
      const path = request.url ?? '';
      if (!/^\/api\/account\/[a-z/-]+$/u.test(path)) return;
      response.once('finish', () => {
        const key = `${response.statusCode} ${path}`;
        if (requestCounts.size < 128 || requestCounts.has(key))
          requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1);
      });
    });
const countTimer = setInterval(() => {
  if (!requestCounts.size) return;
  process.stdout.write(
    JSON.stringify(Object.fromEntries(requestCounts)) + '\n',
  );
  requestCounts.clear();
}, 30_000);
countTimer.unref();
const close = () => {
  if (closing) return;
  closing = true;
  clearInterval(countTimer);
  live.close();
  void Promise.all(hosts.map((value) => value.close()))
    .then(async () => {
      await background.close();
      await communityMedia.close();
      await messages.close();
      await notifications.close();
      await database.close();
    })
    .catch(() => {
      process.exitCode = 1;
    });
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
process.stdout.write('Fixture sintética local disponível na porta de teste.\n');
