import { build } from 'esbuild';
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

// Explicit manual-browser fixture, excluded from production build/entry point.
// Isolated test database and fixed loopback origin; never accepts real wallet keys.
const config = readWebConfiguration(process.env);
if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
  throw new Error('Fixture exige banco de teste exclusivo.');
const origin = 'http://127.0.0.1:45111';
const database = new Database(config.databaseUrl);
await database.migrate();
const assets = new Map(await loadWebAssets());
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
});
const script = bundle.outputFiles[0]?.contents;
if (!script) throw new Error('Fixture ausente.');
assets.set('/fixture-wallet.js', {
  type: 'text/javascript; charset=utf-8',
  content: script,
});
assets.set('/', {
  ...root,
  content: new TextEncoder().encode(
    html
      .replace(
        '<html lang="pt-BR">',
        `<html lang="pt-BR" data-test-app="${app}">`,
      )
      .replace(`src="${app}"`, 'src="/fixture-wallet.js"')
      .replace(
        'Esta versão ainda não envia mensagens nem abre seu histórico.',
        'TESTE ISOLADO: wallet sintética, sem fundos, sem dados reais.',
      ),
  ),
});
const host = createWebServer({
  origin,
  assets,
  database,
  objects: { healthy: () => Promise.resolve(true) },
  account: createAccountHandler({
    origin,
    service: new AccountService({
      store: database.authentication,
      origin,
      capacity: config.accountCapacityBytes,
    }),
  }),
});
await new Promise<void>((resolve, reject) => {
  host.server.once('error', reject);
  host.server.listen(45111, '127.0.0.1', resolve);
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
