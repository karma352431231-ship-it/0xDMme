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
    '0xDMme - PRIVATE VAULT RECOVERY / 私人保险库恢复 - v2',
    'This signature opens your encrypted data. Treat it as a SECRET.',
    '此签名可打开你的加密数据。请将其视为秘密。',
    'Sign only to set up or recover your own devices.',
    '仅在设置或恢复自己的设备时签名。',
    'Not a login, transaction or token approval. Never share this signature.',
    '这不是登录、交易或代币授权。切勿分享此签名。',
    `Origin / 来源: ${config.origin}`,
    `App account / 应用账户: ${config.accountId}`,
    `Ecosystem / 生态系统: ${config.ecosystem}`,
    `Wallet / 钱包: ${config.address}`,
    `Recovery / 恢复: ${config.id}`,
    `Salt / 随机盐: ${config.salt}`,
  ].join('\n');
}
