import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { ParsedMessage } from '@spruceid/siwe-parser';
import { setActiveLanguage } from '../src/shared/i18n/index.ts';
import { loginMessage } from '../src/server/account/siwe.ts';
import { walletStatementVectors } from './fixtures/wallet-statement-vectors.ts';

// These protocol bytes must not be revised like ordinary UI translations.
const hashes = {
  recovery: 'e6ac3b316dfd02428550afc5a7c1ea477e927e330b19427ee77a38ebbd585e26',
  register: '9fe1377d17792e7064542eb52ed0b6bfaa36be70783718b8c48903847de89bcf',
  issue: '0bf91fb5bcf1881e08ae421d832940b575b4e4b707de29875ad7f2cc2492ea3d',
  accept: 'ac2f045c60aa2ec77b1651dc04689c86707e95d1c1bf9cad7b3548545544d8f8',
  revoke: '1592205172c04792cf13bf714a8ad0b89207598cca4f8f2cbcc105fea8561910',
  domain: '5dff64c89e65b4912d92bc76259508da9d6073279bc22ac9d278555b3a6428f6',
  probe: '66dde0efdbc594dc9ad737af172ab15b8205e80cd325c6c45db5415338dcdd03',
};

await test('fixed bilingual v2 signing bytes survive UI language changes', (context) => {
  context.after(() => setActiveLanguage('en'));
  for (const language of ['en', 'zh-CN'] as const) {
    setActiveLanguage(language);
    const messages = walletStatementVectors();
    assert.deepEqual(Object.keys(messages), Object.keys(hashes));
    for (const [name, hash] of Object.entries(hashes))
      assert.equal(
        createHash('sha256').update(messages[name]!).digest('hex'),
        hash,
        name,
      );
  }
});

await test('SIWE remains canonical English under a Chinese UI and rejects a Chinese statement', (context) => {
  context.after(() => setActiveLanguage('en'));
  const input = {
    origin: 'https://0xdmme.app',
    address: '0x0000000000000000000000000000000000000001',
    chainId: 1,
    nonce: 'abcdefgh12345678',
    issuedAt: new Date('2026-10-13T00:00:00Z'),
    expiresAt: new Date('2026-10-13T00:05:00Z'),
    id: '00000000-0000-4000-8000-000000000001',
    deviceId: '00000000-0000-4000-8000-000000000002',
  };
  const message = loginMessage(input);
  setActiveLanguage('zh-CN');
  assert.equal(loginMessage(input), message);
  const parsed = new ParsedMessage(message);
  assert.equal(
    parsed.statement,
    'Sign in to 0xDMme. No funds, transactions or access to encrypted history.',
  );
  assert.throws(
    () =>
      new ParsedMessage(message.replace(parsed.statement!, '登录 0xDMme。')),
  );
});
