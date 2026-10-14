/** Protocol v2 bytes are fixed, bilingual and independent of UI translations. */
export function bilingualRecoveryStatement(config: {
  origin: string;
  accountId: string;
  ecosystem: string;
  address: string;
  id: string;
  salt: string;
}): string {
  return [
    '0xDMme - Set up or restore private access / 设置或恢复私人数据访问 - v2',
    '',
    'This signature lets you set up or restore access to your',
    'encrypted messages and private settings in 0xDMme.',
    '此签名可用于在 0xDMme 中设置或恢复对加密消息和私人设置的访问。',
    '',
    'It does not move funds, send transactions or approve token spending.',
    '它不会转移资金、发送交易或授权代币支出。',
    '',
    'Sign only if you started this request in 0xDMme.',
    '仅在你自己于 0xDMme 中发起此请求时签名。',
    'Keep this signature private.',
    '请勿分享此签名。',
    '',
    `Origin / 来源: ${config.origin}`,
    `App account / 应用账户: ${config.accountId}`,
    `Ecosystem / 生态系统: ${config.ecosystem}`,
    `Wallet / 钱包: ${config.address}`,
    `Recovery / 恢复: ${config.id}`,
    `Salt / 随机盐: ${config.salt}`,
  ].join('\n');
}
