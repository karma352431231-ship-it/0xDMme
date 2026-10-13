import {
  acceptanceStatement,
  credentialStatement,
  domainStatement,
  organization,
  registrationStatement,
  revocationStatement,
} from '../../src/shared/representatives/index.ts';
import {
  recoveryMessage,
  walletRecovery,
} from '../../src/shared/wallet-recovery/index.ts';
import { recoveryMessage as probeMessage } from '../../src/client/wallet-recovery-probe/index.ts';

export function walletStatementVectors(): Record<string, string> {
  const origin = 'https://0xdmme.app';
  const identity = {
    accountId: '00000000-0000-4000-8000-000000000001',
    ecosystem: 'evm' as const,
    address: '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf',
  };
  const recovery = walletRecovery({
    ...identity,
    version: 2,
    origin,
    id: '00000000-0000-4000-8000-000000000002',
    salt: btoa('x'.repeat(32)),
  });
  const org = organization({
    version: 1,
    id: '00000000-0000-4000-8000-000000000003',
    origin,
    issuer: identity,
    name: 'Synthetic team / 合成团队',
  });
  const registration = {
    version: 2 as const,
    organizationId: org.id,
    origin,
    issuer: identity,
    descriptorHash: 'a'.repeat(64),
  };
  const credential = {
    version: 2 as const,
    id: '00000000-0000-4000-8000-000000000004',
    organization: org,
    registration: { ...registration, signature: 'draft' },
    subject: { ...identity, accountId: '00000000-0000-4000-8000-000000000005' },
    scope: 'Support / 支持',
    issuedAt: 1,
    expiresAt: 2,
  };
  return {
    recovery: recoveryMessage(recovery),
    register: registrationStatement(registration),
    issue: credentialStatement(credential),
    accept: acceptanceStatement(
      {
        version: 2,
        credentialHash: 'b'.repeat(64),
        subject: credential.subject,
      },
      origin,
    ),
    revoke: revocationStatement({
      version: 2,
      organizationId: org.id,
      id: credential.id,
      credentialHash: 'b'.repeat(64),
      origin,
    }),
    domain: domainStatement({
      version: 2,
      organizationId: org.id,
      origin,
      domain: 'example.org',
      token: 'c'.repeat(64),
      expiresAt: 2,
    }),
    probe: probeMessage({
      version: 2,
      origin,
      ecosystem: identity.ecosystem,
      address: identity.address,
      id: 'A'.repeat(43),
    }),
  };
}
