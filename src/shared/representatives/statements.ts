import { AccountError } from '../account/index.ts';
import { canonical } from '../devices/index.ts';

const statements = {
  register: [
    '0xdmme-organization-register',
    'Register organization. No funds or financial powers.',
    '注册组织。不会转移资金或授予财务权限。',
  ],
  issue: [
    '0xdmme-representative-issue',
    'Authorize a representative for the scope and period below. No funds or automatic group administration.',
    '授权代表在下述范围和期限内行事。不会转移资金或自动授予群组管理权限。',
  ],
  accept: [
    '0xdmme-representative-accept',
    'Accept this specific representation. No funds.',
    '接受此项特定代表授权。不会转移资金。',
  ],
  revoke: [
    '0xdmme-representative-revoke',
    'Revoke this representative authorization.',
    '撤销此项代表授权。',
  ],
  domain: [
    '0xdmme-domain-bind',
    'Bind a domain to my organization. This binding may be shared. No funds.',
    '将域名绑定到我的组织。此绑定可被分享。不会转移资金。',
  ],
} as const;

export function statementVersion(value: unknown): 2 {
  if (value !== 2)
    throw new AccountError(400, 'Invalid signed statement version.');
  return value;
}

/** Protocol text is fixed; a UI language change never alters a signed document. */
export function signedStatement(
  kind: keyof typeof statements,
  version: unknown,
  values: readonly unknown[],
): string {
  const [purpose, english, chinese] = statements[kind];
  return [
    '0xDMme - AUTHORIZATION / 授权声明 - v2',
    english,
    chinese,
    canonical([purpose, statementVersion(version), ...values]),
  ].join('\n');
}
