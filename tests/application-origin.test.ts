import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {
  recoveryIdentity,
  walletRecovery,
} from '../src/shared/wallet-recovery/index.ts';

async function compiledOrigin(
  installed: boolean | undefined,
  pageOrigin: string,
) {
  const result = await build({
    entryPoints: ['src/client/application-origin/index.ts'],
    absWorkingDir: fileURLToPath(new URL('../', import.meta.url)),
    bundle: true,
    format: 'iife',
    globalName: 'OriginContract',
    write: false,
    ...(installed === undefined
      ? {}
      : { define: { INSTALLED_APP: JSON.stringify(installed) } }),
  });
  const output = result.outputFiles[0];
  assert.ok(output);
  const origin: unknown = new Script(
    output.text + '\nOriginContract.applicationOrigin();',
  ).runInNewContext({ location: { origin: pageOrigin } });
  assert.equal(typeof origin, 'string');
  return String(origin);
}

await test('web identity keeps its current origin, including isolated development', async () => {
  for (const origin of ['https://0xdmme.app', 'http://127.0.0.1:45100']) {
    assert.equal(await compiledOrigin(undefined, origin), origin);
    assert.equal(await compiledOrigin(false, origin), origin);
  }
});

await test('installed assets keep the existing wallet recovery identity on both OSes', async () => {
  const identity = {
    accountId: '11111111-1111-4111-8111-111111111111',
    ecosystem: 'evm' as const,
    address: '0x0000000000000000000000000000000000000001',
  };
  const config = walletRecovery({
    version: 3,
    language: 'en',
    ...identity,
    origin: 'https://0xdmme.app',
    id: '22222222-2222-4222-8222-222222222222',
    salt: Buffer.alloc(32).toString('base64'),
  });
  for (const pageOrigin of ['capacitor://localhost', 'https://localhost']) {
    const native = await compiledOrigin(true, pageOrigin);
    assert.equal(native, config.origin);
    assert.doesNotThrow(() => recoveryIdentity(config, identity, native));
    assert.throws(() => recoveryIdentity(config, identity, pageOrigin));
    assert.throws(() =>
      recoveryIdentity(
        { ...config, origin: 'https://untrusted.invalid' },
        identity,
        native,
      ),
    );
  }
});
