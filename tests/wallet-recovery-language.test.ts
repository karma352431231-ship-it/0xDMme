import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { Wallet } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { setActiveLanguage } from '../src/shared/i18n/index.ts';
import {
  walletRecovery,
  recoveryMessage,
} from '../src/shared/wallet-recovery/index.ts';
import {
  createWalletRecovery,
  walletRecoveryKey,
} from '../src/client/wallet-recovery/index.ts';
import {
  createIdentity,
  createRecovery,
  recoverSecrets,
} from '../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../src/client/device-operations/index.ts';
import { canonical } from '../src/shared/devices/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';

const wallet = new Wallet(`0x${'1'.padStart(64, '0')}`);
const solanaSeed = new Uint8Array(32).fill(7);
const origin = 'https://0xdmme.app';

await test('v3 signing byte vectors are fixed independently of the active UI', (context) => {
  context.after(() => setActiveLanguage('en'));
  const expected = {
    en: 'dddd1e5b085b4458ed82ec72655e9538e894c387d18bc4db402473c084a576bd',
    'zh-CN': 'fbfc79fa4280c68058965bf4d3266459745e311a6bbe5c2634e114b1581f8df2',
  };
  for (const language of ['en', 'zh-CN'] as const) {
    const config = walletRecovery({
      version: 3,
      language,
      accountId: '00000000-0000-4000-8000-000000000001',
      origin,
      ecosystem: 'evm',
      address: '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf',
      id: '00000000-0000-4000-8000-000000000002',
      salt: btoa('x'.repeat(32)),
    });
    for (const ui of ['en', 'zh-CN'] as const) {
      setActiveLanguage(ui);
      assert.equal(
        createHash('sha256').update(recoveryMessage(config)).digest('hex'),
        expected[language],
      );
    }
  }
});

for (const ecosystem of ['evm', 'solana'] as const) {
  for (const language of ['en', 'zh-CN'] as const) {
    await test(`recovery v3 ${ecosystem}/${language}: persisted language survives a different UI/device locale`, async (context) => {
      context.after(() => setActiveLanguage('en'));
      setActiveLanguage(language);
      const user: AccountSession = {
        accountId: crypto.randomUUID(),
        deviceId: crypto.randomUUID(),
        ecosystem,
        address:
          ecosystem === 'evm'
            ? wallet.address.toLowerCase()
            : base58.encode(ed25519.getPublicKey(solanaSeed)),
        csrf: 'a'.repeat(64),
        name: '',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        profileRevision: 0,
        historyAuthorized: false,
        deviceState: 'pending',
      };
      const config = createWalletRecovery(user, origin);
      assert.equal(config.version, 3);
      assert.equal('language' in config && config.language, language);
      const statement = recoveryMessage(config);
      assert.equal(/[\u4e00-\u9fff]/u.test(statement), language === 'zh-CN');
      assert.equal(
        statement.includes('Set up or restore private access'),
        language === 'en',
      );
      const sign = (message: string) =>
        ecosystem === 'evm'
          ? wallet.signMessage(message)
          : Promise.resolve(
              base58.encode(
                ed25519.sign(new TextEncoder().encode(message), solanaSeed),
              ),
            );
      const signature = await sign(statement);
      const key = await walletRecoveryKey(config, [
        signature,
        await sign(statement),
      ]);
      const recovery = await createRecovery(user.accountId, key, config);
      const identity = await createIdentity(
        user.deviceId,
        'Recovery language test',
      );
      const ring = freshKeyring(user.accountId);
      const event = await prepareEvent({
        accountId: user.accountId,
        previous: null,
        kind: 'initialize',
        signer: 'recovery',
        signing: recovery.signing,
        root: recovery.root,
        identities: [identity.public],
        ring,
        profile: null,
      });
      setActiveLanguage(language === 'en' ? 'zh-CN' : 'en');
      const restored = walletRecovery(
        JSON.parse(JSON.stringify(config)) as unknown,
      );
      assert.equal(recoveryMessage(restored), statement);
      assert.deepEqual(
        (
          await recoverSecrets(
            JSON.parse(canonical(event)) as typeof event,
            await walletRecoveryKey(restored, [
              await sign(recoveryMessage(restored)),
            ]),
          )
        ).ring,
        ring,
      );
      await assert.rejects(
        walletRecoveryKey(
          {
            ...config,
            version: 3,
            language: language === 'en' ? 'zh-CN' : 'en',
          },
          [signature],
        ),
      );
      assert.throws(() => walletRecovery({ ...config, language: 'pt-BR' }));
      const missing = Object.fromEntries(
        Object.entries(config).filter(([name]) => name !== 'language'),
      );
      assert.throws(() => walletRecovery(missing));
      assert.throws(() => walletRecovery({ ...config, version: 2 }));
    });
  }
}
