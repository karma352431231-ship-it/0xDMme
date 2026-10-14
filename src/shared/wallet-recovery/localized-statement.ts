import type { WalletRecovery } from './configuration.ts';

/** Protocol v3 wording is fixed, not a mutable UI translation. */
export function localizedRecoveryStatement(
  config: Extract<WalletRecovery, { version: 3 }>,
): string {
  const chinese = config.language === 'zh-CN';
  const text = chinese
    ? [
        '0xDMme - 设置或恢复私人数据访问 - v3',
        '',
        '此签名可用于在 0xDMme 中设置或恢复对加密消息和私人设置的访问。',
        '',
        '它不会转移资金、发送交易或授权代币支出。',
        '',
        '仅在你自己于 0xDMme 中发起此请求时签名。',
        '请勿分享此签名。',
      ]
    : [
        '0xDMme - Set up or restore private access - v3',
        '',
        'This signature lets you set up or restore access to your',
        'encrypted messages and private settings in 0xDMme.',
        '',
        'It does not move funds, send transactions or approve token spending.',
        '',
        'Sign only if you started this request in 0xDMme.',
        'Keep this signature private.',
      ];
  return [
    ...text,
    '',
    `${chinese ? '来源' : 'Origin'}: ${config.origin}`,
    `${chinese ? '应用账户' : 'App account'}: ${config.accountId}`,
    `${chinese ? '生态系统' : 'Ecosystem'}: ${config.ecosystem}`,
    `${chinese ? '钱包' : 'Wallet'}: ${config.address}`,
    `${chinese ? '恢复' : 'Recovery'}: ${config.id}`,
    `${chinese ? '随机盐' : 'Salt'}: ${config.salt}`,
  ].join('\n');
}
