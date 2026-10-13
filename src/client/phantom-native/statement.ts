/** A fixed bilingual v2 document, not an application login or recovery signature. */
export function returnProofStatement(origin: string, id: string): string {
  return [
    '0xDMme - Phantom return proof / Phantom 返回验证 - v2',
    `Origin / 来源: ${origin}`,
    `Request / 请求: ${id}`,
    'This tests browser return only: no account login, transactions or history access.',
    '此签名仅测试返回浏览器：不会登录账户、授权交易或访问历史记录。',
  ].join('\n');
}
