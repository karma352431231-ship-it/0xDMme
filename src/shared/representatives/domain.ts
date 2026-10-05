import {
  AccountError,
  boundedText,
  keys,
  object,
  uuid,
} from '../account/index.ts';
import { canonical, digest, fingerprint } from '../devices/index.ts';
export const domainWindow = 30 * 60_000;
export const domainFreshness = 24 * 60 * 60_000;
export interface DomainClaim {
  organizationId: string;
  origin: string;
  domain: string;
  token: string;
  expiresAt: number;
  signature: string;
}
export function domainName(input: unknown): string {
  const raw = boundedText(input, 253).trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/u.test(raw))
    throw new AccountError(
      400,
      'Informe somente o domínio, sem endereço de página.',
    );
  const labels = raw.split('.'),
    last = labels.at(-1) ?? '';
  if (labels.length < 2 || !/^[a-z]{2,63}$/u.test(last))
    throw new AccountError(400, 'Domínio público inválido.');
  if (
    [
      'local',
      'localhost',
      'internal',
      'invalid',
      'test',
      'onion',
      'arpa',
    ].includes(last)
  )
    throw new AccountError(400, 'Domínio privado não permitido.');
  if (
    labels.some(
      (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label),
    )
  )
    throw new AccountError(400, 'Domínio inválido.');
  return raw;
}
export function domainClaim(input: unknown): DomainClaim {
  const d = object(input);
  keys(d, [
    'organizationId',
    'origin',
    'domain',
    'token',
    'expiresAt',
    'signature',
  ]);
  if (
    typeof d['expiresAt'] !== 'number' ||
    !Number.isSafeInteger(d['expiresAt']) ||
    d['expiresAt'] < 1
  )
    throw new AccountError(400, 'Desafio inválido.');
  const origin = new URL(boundedText(d['origin'], 256));
  if (origin.origin !== d['origin'])
    throw new AccountError(400, 'Origem inválida.');
  return {
    organizationId: uuid(d['organizationId']),
    origin: origin.origin,
    domain: domainName(d['domain']),
    token: fingerprint(d['token']),
    expiresAt: d['expiresAt'],
    signature: boundedText(d['signature'], 132),
  };
}
export function domainStatement(claim: Omit<DomainClaim, 'signature'>): string {
  return `0xDMme — Vincular domínio à minha organização. Este vínculo poderá ser compartilhado. Sem fundos.\n${canonical(['0xdmme-domain-bind', 1, claim])}`;
}
export async function domainRecord(claim: DomainClaim): Promise<string> {
  return `0xdmme-verification=${await digest(canonical(claim))}`;
}
