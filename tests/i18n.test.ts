import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  currentLanguage,
  isAppLanguage,
  preferredLanguage,
  setActiveLanguage,
  staticText,
  t,
  translatedError,
} from '../src/shared/i18n/index.ts';
import { catalog } from '../src/shared/i18n/catalog.ts';
import { vaultLabel } from '../src/client/vault-labels/index.ts';
import { recoveryMessage } from '../src/shared/wallet-recovery/index.ts';
import type { WalletRecovery } from '../src/shared/wallet-recovery/index.ts';

await test('catalogs preserve every placeholder and have no empty translations', () => {
  const placeholders = (value: string) =>
    [...value.matchAll(/\{\d+\}/gu)].map((match) => match[0]).sort();
  for (const [source, pair] of Object.entries(catalog)) {
    assert.equal(pair.length, 2, source);
    for (const translation of pair) {
      assert.ok(translation.trim(), source);
      assert.deepEqual(
        placeholders(translation),
        placeholders(source.startsWith('html.') ? pair[0] : source),
        source,
      );
    }
  }
});

await test('official languages respect preference order and default to English', () => {
  assert.equal(preferredLanguage(['pt-BR', 'en-US', 'zh-CN']), 'en');
  assert.equal(preferredLanguage(['zh-TW', 'en']), 'en');
  assert.equal(preferredLanguage(['zh-CN', 'en']), 'zh-CN');
  assert.equal(preferredLanguage(['zh-Hans-SG', 'en']), 'zh-CN');
  assert.equal(preferredLanguage(['pt-BR', 'zh-CN']), 'en');
  assert.equal(preferredLanguage(['pt-BR', 'es']), 'en');
  assert.ok(isAppLanguage('en'));
  assert.ok(isAppLanguage('zh-CN'));
  assert.equal(isAppLanguage('pt-BR'), false);
});

await test('translation leaves user substitutions untouched and rejects missing keys', () => {
  for (const language of ['en', 'zh-CN'] as const) {
    setActiveLanguage(language);
    const value = 'Perfil <b>&$1 {0} 名字';
    assert.ok(t('{0} convidou você para um grupo', [value]).startsWith(value));
    assert.throws(() => t('constructor'), /Missing translation/u);
    assert.equal(
      staticText('A private name that is not authored UI'),
      'A private name that is not authored UI',
    );
  }
  setActiveLanguage('en');
});

await test('server errors retain the reason, numeric details and coarse diagnostics', () => {
  setActiveLanguage('zh-CN');
  assert.equal(
    translatedError('A descrição aceita até 500 caracteres.'),
    '简介最多允许 500 个字符。',
  );
  assert.equal(translatedError('Device not authorized.'), '设备未获授权。');
  assert.equal(
    translatedError('Esta mensagem atingiu 64 edições.'),
    '此消息已达到 64 次编辑。',
  );
  assert.equal(
    translatedError(
      'Índice do grupo parcialmente conferido. Continue a sincronização.',
    ),
    '群组索引已部分核验。请继续同步。',
  );
  assert.equal(staticText('  Initial\n    settings  '), '  初始设置  ');
  assert.equal(
    translatedError(
      'Cofre cheio. Preserve ou exclua conteúdo antes de aceitar novos dados. [vault/save · HTTP 409 · http · json]',
    ),
    '保险库已满。接受新数据前，请保留或删除内容。 [vault/save · HTTP 409 · http · json]',
  );
  assert.equal(translatedError('constructor'), '操作未能完成。请重试。');
  assert.equal(
    translatedError('private provider text [wallet/save · PRIVATE]'),
    '操作未能完成。请重试。',
  );
  assert.equal(
    translatedError('private provider payload'),
    '操作未能完成。请重试。',
  );
  setActiveLanguage('en');
});

await test('stored labels remain intact and bilingual recovery bytes do not follow the UI locale', () => {
  const config: WalletRecovery = {
    version: 2,
    accountId: crypto.randomUUID(),
    origin: 'https://0xdmme.app',
    ecosystem: 'evm',
    address: `0x${'1'.repeat(40)}`,
    id: crypto.randomUUID(),
    salt: btoa('x'.repeat(32)),
  };
  const statement = recoveryMessage(config);
  assert.match(statement, /Set up or restore private access/u);
  assert.match(statement, /设置或恢复私人数据访问/u);
  setActiveLanguage('zh-CN');
  assert.equal(recoveryMessage(config), statement);
  assert.equal(
    vaultLabel({ kind: 'settings', label: 'Configurações da conta' }),
    '账户设置',
  );
  assert.equal(
    vaultLabel({ kind: 'contact', label: 'Configurações da conta' }),
    'Configurações da conta',
  );
  assert.equal(currentLanguage(), 'zh-CN');
  setActiveLanguage('en');
});
