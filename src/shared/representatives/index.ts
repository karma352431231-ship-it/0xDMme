import {
  AccountError,
  boundedText,
  displayName,
  keys,
  object,
  uuid,
} from '../account/index.ts';
import { canonical, digest, fingerprint } from '../devices/index.ts';
import { canonicalAddress, ecosystem } from '../wallet-identity/index.ts';
import type { Ecosystem } from '../wallet-identity/index.ts';
import { verifyWalletStatement } from './signature.ts';
export { verifyWalletStatement };
export {
  domainName,
  domainClaim,
  domainStatement,
  domainRecord,
  domainWindow,
  domainFreshness,
} from './domain.ts';
export type { DomainClaim } from './domain.ts';

export interface RepresentativeIdentity {
  accountId: string;
  ecosystem: Ecosystem;
  address: string;
}
export interface Organization {
  version: 1;
  id: string;
  origin: string;
  name: string;
  issuer: RepresentativeIdentity;
}
export interface OrganizationRegistration {
  organizationId: string;
  origin: string;
  issuer: RepresentativeIdentity;
  descriptorHash: string;
  signature: string;
}
export interface RepresentativeCredential {
  version: 1;
  id: string;
  organization: Organization;
  registration: OrganizationRegistration;
  subject: RepresentativeIdentity;
  scope: string;
  issuedAt: number;
  expiresAt: number;
  signature: string;
}
export interface RepresentativeAcceptance {
  credentialHash: string;
  subject: RepresentativeIdentity;
  signature: string;
}
export interface RepresentativeCard {
  credential: RepresentativeCredential;
  acceptance: RepresentativeAcceptance | null;
}
export interface RepresentativeRevocation {
  organizationId: string;
  id: string;
  credentialHash: string;
  origin: string;
  signature: string;
}
export const cardPrefix = '0xDMme:authorization:v1\n';

export function representativeIdentity(input: unknown): RepresentativeIdentity {
  const d = object(input);
  keys(d, ['accountId', 'ecosystem', 'address']);
  const network = ecosystem(d['ecosystem']);
  return {
    accountId: uuid(d['accountId']),
    ecosystem: network,
    address: canonicalAddress(network, d['address']),
  };
}
export function representativeOrigin(input: unknown): string {
  const value = boundedText(input, 256),
    u = new URL(value);
  if (u.origin !== value || !['https:', 'http:'].includes(u.protocol))
    throw new AccountError(400, 'Origem da autorização inválida.');
  if (
    u.protocol === 'http:' &&
    !['localhost', '127.0.0.1'].includes(u.hostname)
  )
    throw new AccountError(400, 'Autorização exige HTTPS.');
  return value;
}
export function statementSignature(input: unknown): string {
  return boundedText(input, 132);
}
export function representativeTime(input: unknown): number {
  if (
    typeof input !== 'number' ||
    !Number.isSafeInteger(input) ||
    input < 1 ||
    input > 8_640_000_000_000_000
  )
    throw new AccountError(400, 'Prazo inválido.');
  return input;
}
export function organization(input: unknown): Organization {
  const d = object(input);
  keys(d, ['version', 'id', 'origin', 'name', 'issuer']);
  const name = displayName(d['name']);
  if (d['version'] !== 1 || !name)
    throw new AccountError(400, 'Organização inválida.');
  return {
    version: 1,
    id: uuid(d['id']),
    origin: representativeOrigin(d['origin']),
    name,
    issuer: representativeIdentity(d['issuer']),
  };
}
export function organizationRegistration(
  input: unknown,
): OrganizationRegistration {
  const d = object(input);
  keys(d, [
    'organizationId',
    'origin',
    'issuer',
    'descriptorHash',
    'signature',
  ]);
  return {
    organizationId: uuid(d['organizationId']),
    origin: representativeOrigin(d['origin']),
    issuer: representativeIdentity(d['issuer']),
    descriptorHash: fingerprint(d['descriptorHash']),
    signature: statementSignature(d['signature']),
  };
}
export function registrationStatement(
  r: Omit<OrganizationRegistration, 'signature'>,
): string {
  return `0xDMme — Registrar organização. Sem fundos ou poderes financeiros.\n${canonical(['0xdmme-organization-register', 1, r])}`;
}
export function credentialStatement(
  c: Omit<RepresentativeCredential, 'signature'>,
): string {
  return `0xDMme — Autorizar representante para o escopo e prazo abaixo. Sem fundos ou administração automática de grupos.\n${canonical(['0xdmme-representative-issue', 1, c])}`;
}
export function acceptanceStatement(
  a: Omit<RepresentativeAcceptance, 'signature'>,
  origin: string,
): string {
  return `0xDMme — Aceitar representação específica. Sem fundos.\n${canonical(['0xdmme-representative-accept', 1, origin, a])}`;
}
export function revocationStatement(
  r: Omit<RepresentativeRevocation, 'signature'>,
): string {
  return `0xDMme — Revogar esta autorização de representante.\n${canonical(['0xdmme-representative-revoke', 1, r])}`;
}
export function credential(input: unknown): RepresentativeCredential {
  const d = object(input);
  keys(d, [
    'version',
    'id',
    'organization',
    'registration',
    'subject',
    'scope',
    'issuedAt',
    'expiresAt',
    'signature',
  ]);
  const scope = boundedText(d['scope'], 240).normalize('NFC').trim(),
    issuedAt = representativeTime(d['issuedAt']),
    expiresAt = representativeTime(d['expiresAt']);
  if (
    d['version'] !== 1 ||
    !scope ||
    /[\p{Cc}\p{Cf}]/u.test(scope) ||
    expiresAt <= issuedAt
  )
    throw new AccountError(400, 'Autorização inválida.');
  return {
    version: 1,
    id: uuid(d['id']),
    organization: organization(d['organization']),
    registration: organizationRegistration(d['registration']),
    subject: representativeIdentity(d['subject']),
    scope,
    issuedAt,
    expiresAt,
    signature: statementSignature(d['signature']),
  };
}
export function acceptance(input: unknown): RepresentativeAcceptance {
  const d = object(input);
  keys(d, ['credentialHash', 'subject', 'signature']);
  return {
    credentialHash: fingerprint(d['credentialHash']),
    subject: representativeIdentity(d['subject']),
    signature: statementSignature(d['signature']),
  };
}
export function revocation(input: unknown): RepresentativeRevocation {
  const d = object(input);
  keys(d, ['organizationId', 'id', 'credentialHash', 'origin', 'signature']);
  return {
    organizationId: uuid(d['organizationId']),
    id: uuid(d['id']),
    credentialHash: fingerprint(d['credentialHash']),
    origin: representativeOrigin(d['origin']),
    signature: statementSignature(d['signature']),
  };
}
export function representativeCard(input: unknown): RepresentativeCard {
  const d = object(input);
  keys(d, ['credential', 'acceptance']);
  return {
    credential: credential(d['credential']),
    acceptance: d['acceptance'] === null ? null : acceptance(d['acceptance']),
  };
}
export function encodeRepresentativeCard(card: RepresentativeCard): string {
  const text = cardPrefix + JSON.stringify(representativeCard(card));
  if (text.length > 4000)
    throw new AccountError(400, 'Cartão excede o limite da mensagem.');
  return text;
}
export function decodeRepresentativeCard(
  text: string,
): RepresentativeCard | null {
  if (!text.startsWith(cardPrefix)) return null;
  if (text.length > 4000) throw new AccountError(400, 'Cartão excedido.');
  return representativeCard(
    JSON.parse(text.slice(cardPrefix.length)) as unknown,
  );
}
export const representativeHash = (input: unknown): Promise<string> =>
  digest(canonical(input));

export async function verifyRepresentativeCard(
  input: unknown,
  expectedOrigin: string,
): Promise<RepresentativeCard> {
  const card = representativeCard(input),
    c = card.credential,
    r = c.registration;
  if (
    c.organization.origin !== expectedOrigin ||
    r.origin !== expectedOrigin ||
    r.organizationId !== c.organization.id ||
    canonical(r.issuer) !== canonical(c.organization.issuer)
  )
    throw new AccountError(403, 'Emissor/contexto divergente.');
  if ((await representativeHash(c.organization)) !== r.descriptorHash)
    throw new AccountError(403, 'Organização adulterada.');
  const { signature: registrationSignature, ...registrationBody } = r;
  verifyWalletStatement(
    r.issuer,
    registrationStatement(registrationBody),
    registrationSignature,
  );
  const { signature, ...body } = c;
  verifyWalletStatement(r.issuer, credentialStatement(body), signature);
  if (card.acceptance) {
    const { signature: acceptanceSignature, ...acceptanceBody } =
      card.acceptance;
    if (
      canonical(c.subject) !== canonical(acceptanceBody.subject) ||
      (await representativeHash(c)) !== acceptanceBody.credentialHash
    )
      throw new AccountError(403, 'Aceite de outra autorização.');
    verifyWalletStatement(
      c.subject,
      acceptanceStatement(acceptanceBody, expectedOrigin),
      acceptanceSignature,
    );
  }
  return card;
}
