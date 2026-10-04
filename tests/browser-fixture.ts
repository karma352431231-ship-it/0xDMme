import { build } from 'esbuild';
import { randomBytes } from 'node:crypto';
import { Database } from '../src/server/database/index.ts';
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
import { VaultService } from '../src/server/vault/index.ts';
import { ObjectStore } from '../src/server/object-store/index.ts';
import { MessageService } from '../src/server/messages/index.ts';
import { ContactService } from '../src/server/contacts/index.ts';
import { NotificationService } from '../src/server/notifications/index.ts';
import { frontendEmoji, emojiAsset } from '../src/tools/frontend-emoji.ts';
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
const fixtureSeed =
  process.env['HASH_TALK_FIXTURE_SYNTHETIC_SEED'] ??
  `0x${randomBytes(32).toString('hex')}`;
if (!/^0x[a-f0-9]{64}$/u.test(fixtureSeed))
  throw new Error(
    'Seed sintética de fixture inválida. Nunca forneça uma chave real.',
  );
const database = new Database(config.databaseUrl, config.accountCapacityBytes);
await database.migrate();
const objects = new ObjectStore(config.objectDirectory);
await objects.initialize();
const assets = new Map(await loadWebAssets());
if (process.env['HASH_TALK_FIXTURE_EMOJI_CONTROLS'] === '1')
  await emojiFixture(assets);
const root = assets.get('/');
if (!root) throw new Error('Build ausente.');
const html = new TextDecoder().decode(root.content);
const app = html.match(/src="(\/app-[a-f0-9]+\.js)"/u)?.[1];
if (!app) throw new Error('Build de app ausente.');
const bundle = await build({
  entryPoints: ['tests/fixtures/wallet-browser.ts'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  minify: true,
  write: false,
  define: {
    SYNTHETIC_VAULT_CONTROLS:
      process.env['HASH_TALK_FIXTURE_VAULT_CONTROLS'] === '1'
        ? 'true'
        : 'false',
    SYNTHETIC_FIXTURE_SEED: JSON.stringify(fixtureSeed),
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
assets.set('/fixture-wallet.js', {
  type: 'text/javascript; charset=utf-8',
  content: script,
});
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
          '<html lang="pt-BR">',
          `<html lang="pt-BR" data-test-app="${pageScript}">`,
        )
        .replace(`src="${pageScript}"`, 'src="/fixture-wallet.js"')
        .replace(
          'Chat em teste: use somente contas e mensagens fictícias.',
          'TESTE ISOLADO: wallet sintética, sem fundos, sem dados reais.',
        ),
    ),
  });
}
const notifications = new NotificationService({
  store: database.daily,
  devices: database.devices,
  config: null,
});
const host = createWebServer({
  origin,
  assets,
  database,
  objects,
  account: createAccountHandler({
    contacts: new ContactService(database.contacts, database.devices),
    messages: new MessageService(
      database,
      database.devices,
      objects,
      notifications,
    ),
    notifications,
    devices: new DeviceService(database.devices, origin),
    ...fixtureDocuments(),
    vault: new VaultService({
      store: database.vault,
      devices: database.devices,
      objects,
    }),
    origin,
    service: new AccountService({
      store: database.authentication,
      origin,
    }),
  }),
});
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
  const data = await frontendEmoji(process.cwd());
  const result = await build({
    entryPoints: ['tests/fixtures/emoji-browser.ts'],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    write: false,
    define: {
      EMOJI_CATALOG: JSON.stringify(data.catalog),
      EMOJI_ASSET_URL: JSON.stringify(`/${emojiAsset}`),
    },
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
const close = () => {
  if (closing) return;
  closing = true;
  void host
    .close()
    .then(() => database.close())
    .catch(() => {
      process.exitCode = 1;
    });
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
process.stdout.write('Fixture sintética local disponível na porta de teste.\n');
