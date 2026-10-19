import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { loadMessageDirectory } from '../src/client/messages/startup.ts';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { SocialDms } from '../src/client/social-dm/index.ts';
import type { Messages } from '../src/client/messages/controller.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type { VaultAccess } from '../src/client/vault-authority/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';

// Slow public WASM transfer, real Messages.initialize; no user keys or network.
const bundle = await build({
  stdin: {
    contents:
      "export { Messages } from './src/client/messages/controller.ts'; export { SocialDms } from './src/client/social-dm/index.ts'; export { loadMessageDirectory } from './src/client/messages/startup.ts';",
    resolveDir: process.cwd(),
    sourcefile: 'startup-fixture.ts',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'messageModule',
  define: {
    'import.meta.url': JSON.stringify(
      'https://synthetic.invalid/startup-test.js',
    ),
  },
  plugins: [
    {
      name: 'delayed-matrix-runtime',
      setup(builder) {
        builder.onResolve(
          { filter: /^@matrix-org\/matrix-sdk-crypto-wasm$/ },
          () => ({
            path: 'sdk',
            namespace: 'fixture',
          }),
        );
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: `export * from ${JSON.stringify(fileURLToPath(new URL('../node_modules/@matrix-org/matrix-sdk-crypto-wasm/index.mjs', import.meta.url)))}; export const initAsync = () => fixture.load();`,
          loader: 'js',
          resolveDir: import.meta.dirname,
        }));
      },
    },
  ],
});
function delayed() {
  let resolve: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function controller(load: () => Promise<void>, kind = 'private') {
  const context = {
    fixture: { load },
    crypto,
    URL,
    TextEncoder,
    TextDecoder,
    AbortController,
    navigator: { onLine: true },
    messageModule: null as unknown,
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const Constructor = (context.messageModule as { Messages: typeof Messages })
    .Messages;
  let entered = 0;
  const access: VaultAccess = {
    withVault: () => {
      entered++;
      return Promise.reject(new Error('Verified authority requested'));
    },
    withLocalVault: () =>
      Promise.reject(new Error('Offline authority not used')),
  };
  const SocialConstructor = (
    context.messageModule as { SocialDms: typeof SocialDms }
  ).SocialDms;
  const sync = new VaultSync(access);
  const messages =
    kind === 'public'
      ? new SocialConstructor(access, sync)
      : new Constructor(access, sync, () => {});
  messages.setSession({
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'synthetic',
  } as AccountSession);
  return {
    messages,
    entered: () => entered,
    start: (
      context.messageModule as {
        loadMessageDirectory: typeof loadMessageDirectory;
      }
    ).loadMessageDirectory,
  };
}
for (const kind of ['private', 'public'])
  for (const outcome of ['ready', 'logout', 'failed'] as const)
    await test(`first ${kind} message initialization keeps the account queue free while WASM loads: ${outcome}`, async () => {
      const runtime = delayed();
      const fixture = controller(() => runtime.promise, kind);
      const result = fixture.messages.initialize().then(
        () => null,
        (error: unknown) => error,
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(
        fixture.entered(),
        0,
        'A slow public runtime must not hold serialized account authority',
      );
      if (outcome === 'logout') fixture.messages.setSession(null);
      if (outcome === 'failed')
        runtime.reject(new Error('Synthetic runtime failure'));
      else runtime.resolve();
      const error = await result;
      assert.match(
        String(error),
        outcome === 'ready'
          ? /Verified authority/u
          : outcome === 'logout'
            ? /Sessão/u
            : /Synthetic runtime failure/u,
      );
      assert.equal(fixture.entered(), outcome === 'ready' ? 1 : 0);
    });

await test('authorized contacts appear during a slow runtime transfer; messages wait for verification', async () => {
  const runtime = delayed(),
    fixture = controller(() => runtime.promise);
  const contacts = delayed();
  let completed = false;
  let directorySettled = false;
  const startup = fixture
    .start({
      loadPins: () => Promise.resolve(),
      loadContacts: () => {
        contacts.resolve();
        return Promise.resolve();
      },
      guard: () => {},
      settled: () => {
        directorySettled = true;
      },
    })
    .then(() => {
      completed = true;
    });
  await contacts.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(directorySettled, true);
  assert.equal(completed, false);
  runtime.resolve();
  await startup;
  assert.equal(completed, true);
});
for (const failure of ['runtime', 'directory', 'logout'] as const)
  await test(`directory startup rejects ${failure} failure`, async () => {
    const runtime = delayed(),
      fixture = controller(() => runtime.promise);
    const directory = delayed();
    let invalid = false,
      settled = false;
    const startup = fixture
      .start({
        loadPins: () => Promise.resolve(),
        loadContacts: () => directory.promise,
        guard: () => {
          if (invalid) throw new Error('Session changed');
        },
        settled: () => {
          settled = true;
        },
      })
      .then(
        () => null,
        (error: unknown) => error,
      );
    if (failure === 'logout') invalid = true;
    if (failure === 'runtime') runtime.reject(new Error('Runtime failed'));
    else runtime.resolve();
    if (failure === 'directory')
      directory.reject(new Error('Directory failed'));
    else directory.resolve();
    assert.ok(await startup);
    assert.equal(settled, failure !== 'logout');
  });

await test('startup settles its directory task even when the runtime fails first', async () => {
  const runtime = delayed(),
    fixture = controller(() => runtime.promise);
  const directory = delayed(),
    started = delayed();
  let settled = false;
  const startup = fixture
    .start({
      loadPins: () => Promise.resolve(),
      loadContacts: () => {
        started.resolve();
        return directory.promise;
      },
      guard: () => {},
    })
    .then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
  await started.promise;
  runtime.reject(new Error('Runtime unavailable'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(
    settled,
    false,
    'A live directory task must not outlast the startup operation',
  );
  directory.resolve();
  await startup;
  assert.equal(settled, true);
});
