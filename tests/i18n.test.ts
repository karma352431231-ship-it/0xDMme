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
import { communityMediaResult } from '../src/shared/community-media/index.ts';
import { AccountError } from '../src/shared/account/index.ts';
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
    assert.ok(t('{0} invited you to a group', [value]).startsWith(value));
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
    translatedError('The description allows up to 500 characters.'),
    '简介最多允许 500 个字符。',
  );
  assert.equal(translatedError('Device not authorized.'), '设备未获授权。');
  for (const [message, expected] of [
    ['Invalid call invitation.', '通话邀请无效。'],
    [
      'Media is not ready yet. Resume the upload.',
      '媒体尚未准备好。请继续上传。',
    ],
    ['Invalid Solana address.', 'Solana 地址无效。'],
    ['Video must be at most 120 seconds long.', '视频时长不得超过 120 秒。'],
  ]) {
    assert.equal(translatedError(message!), expected);
  }
  assert.equal(
    translatedError('This message has reached 64 edits.'),
    '此消息已达到 64 次编辑。',
  );
  assert.equal(
    translatedError('Group index partially verified. Continue syncing.'),
    '群组索引已部分核验。请继续同步。',
  );
  assert.equal(staticText('  Initial\n    settings  '), '  初始设置  ');
  assert.equal(
    translatedError(
      'Vault full. Preserve or delete content before accepting new data. [vault/save · HTTP 409 · http · json]',
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

await test('hash-pinned media errors display in both UI languages without translating user content', () => {
  const cases: readonly (readonly [string, string, string])[] = [
    ['Metadados inválidos.', 'Invalid media metadata.', '媒体元数据无效。'],
    [
      'Metadados excedidos.',
      'Media metadata exceeds the limit.',
      '媒体元数据超出限制。',
    ],
    [
      'Inspeção incompleta.',
      'Media inspection incomplete.',
      '媒体检查不完整。',
    ],
    ['Sequência inválida.', 'Invalid media sequence.', '媒体序列无效。'],
    [
      'Sequência excedida ou vazia.',
      'Media sequence is empty or exceeds the limit.',
      '媒体序列为空或超出限制。',
    ],
    [
      'Decodificação incompleta.',
      'Media decoding incomplete.',
      '媒体解码不完整。',
    ],
    [
      'Cobertura da análise incompleta.',
      'Media analysis coverage is incomplete.',
      '媒体分析覆盖不完整。',
    ],
    ['Frame inválido.', 'Invalid media frame.', '媒体帧无效。'],
    [
      'Sequência de mídia excedida.',
      'Media sequence exceeds the limit.',
      '媒体序列超出限制。',
    ],
    [
      'Dimensão da análise inválida.',
      'Invalid media analysis dimensions.',
      '媒体分析尺寸无效。',
    ],
    [
      'Mídia preparada inválida.',
      'Invalid prepared media.',
      '已准备的媒体无效。',
    ],
    [
      'Cobertura da análise inválida.',
      'Invalid media analysis coverage.',
      '媒体分析覆盖无效。',
    ],
    [
      'Modelo/política da análise divergente.',
      'Media analysis model or policy mismatch.',
      '媒体分析模型或策略不匹配。',
    ],
    [
      'Mídia preparada divergente.',
      'Prepared media mismatch.',
      '已准备的媒体不匹配。',
    ],
    [
      'Análise pública indisponível.',
      'Public analysis unavailable.',
      '公开内容分析不可用。',
    ],
    ['Duração de mídia inválida.', 'Invalid media duration.', '媒体时长无效。'],
    ['FPS de mídia inválido.', 'Invalid media frame rate.', '媒体帧率无效。'],
  ];
  try {
    for (const language of ['en', 'zh-CN'] as const) {
      setActiveLanguage(language);
      for (const [wire, english, chinese] of cases) {
        const expected = language === 'en' ? english : chinese;
        assert.equal(translatedError(wire), expected);
        const diagnostic =
          ' [communities/media-status · HTTP 400 · http · json]';
        assert.equal(translatedError(wire + diagnostic), expected + diagnostic);
        assert.equal(staticText(wire), wire);
        assert.ok(!Object.hasOwn(catalog, wire));
        assert.equal(
          t('Explain: {0}', [wire]),
          language === 'en' ? `Explain: ${wire}` : `说明：${wire}`,
        );
      }
    }
  } finally {
    setActiveLanguage('en');
  }
});

await test('media validation errors keep their original reason while the UI displays the selected language', () => {
  const result = {
    kind: 'video',
    type: 'video/mp4',
    bytes: 100,
    width: 1280,
    height: 720,
    seconds: 120,
    fps: 30,
    thumbnailBytes: 100,
    normalized: true,
  };
  try {
    for (const [field, value, wire, english, chinese] of [
      [
        'seconds',
        121,
        'Duração de mídia inválida.',
        'Invalid media duration.',
        '媒体时长无效。',
      ],
      [
        'fps',
        31,
        'FPS de mídia inválido.',
        'Invalid media frame rate.',
        '媒体帧率无效。',
      ],
    ] as const) {
      let failure: AccountError | undefined;
      assert.throws(
        () => communityMediaResult({ ...result, [field]: value }),
        (error: unknown) => {
          if (!(error instanceof AccountError)) return false;
          failure = error;
          return true;
        },
      );
      assert.equal(failure!.status, 400);
      assert.equal(failure!.message, wire);
      setActiveLanguage('en');
      assert.equal(translatedError(failure!.message), english);
      setActiveLanguage('zh-CN');
      assert.equal(translatedError(failure!.message), chinese);
      assert.equal(failure!.message, wire);
    }
  } finally {
    setActiveLanguage('en');
  }
});
