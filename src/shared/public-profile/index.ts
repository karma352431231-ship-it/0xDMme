import {
  AccountError,
  boundedText,
  keys,
  object,
  uuid,
} from '../account/index.ts';
import { canonical } from '../devices/index.ts';
import { pendingPublicAvatar } from '../public-avatar/index.ts';
import type { PendingPublicAvatar } from '../public-avatar/index.ts';

const reserved = new Set([
  'admin',
  'administrator',
  'administrador',
  'moderator',
  'moderador',
  'support',
  'suporte',
  'help',
  'ajuda',
  'official',
  'oficial',
  'system',
  'sistema',
  'root',
  '0xdmme',
  '0xdmmeapp',
  'api',
  'perfil',
  'comunidades',
  'feed',
  'explorar',
  'conversas',
  'contatos',
  'configuracoes',
  'wallet',
  'walletapproval',
  'recovery',
  'null',
  'undefined',
]);

export function publicHandle(value: unknown): string {
  if (typeof value !== 'string') throw new AccountError(400, '@ inválido.');
  const handle = value.trim().replace(/^@/u, '').toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/u.test(handle) || !/[a-z0-9]/u.test(handle))
    throw new AccountError(400, 'Use 3–30 letras sem acento, números ou _.');
  return handle;
}
export function claimableHandle(value: unknown): string {
  const handle = publicHandle(value);
  if (reserved.has(handle.replaceAll('_', '')))
    throw new AccountError(400, 'Este @ é reservado pelo aplicativo.');
  return handle;
}

/** Explicit public allowlist. Uploaded avatars stay restricted until cut 10. */
export interface PublicProfile {
  id: string;
  handle: string;
  avatar: null;
}
export interface OwnPublicProfile {
  profile: PublicProfile;
  revision: number;
  pendingAvatar: PendingPublicAvatar | null;
}
export function publicProfile(value: unknown): PublicProfile {
  const data = object(value);
  keys(data, ['id', 'handle', 'avatar']);
  if (data['avatar'] !== null)
    throw new AccountError(400, 'Avatar ainda restrito.');
  return {
    id: uuid(data['id']),
    handle: publicHandle(data['handle']),
    avatar: null,
  };
}
export function profileRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new AccountError(400, 'Revisão inválida.');
  return value;
}
export function ownPublicProfile(value: unknown): OwnPublicProfile | null {
  if (value === null) return null;
  const data = object(value);
  keys(data, ['profile', 'revision', 'pendingAvatar']);
  return {
    profile: publicProfile(data['profile']),
    revision: profileRevision(data['revision']),
    pendingAvatar: pendingPublicAvatar(data['pendingAvatar']),
  };
}
export function publicProfileProof(value: unknown) {
  const data = object(value);
  keys(data, ['directory', 'payload', 'signature']);
  const directory = boundedText(data['directory'], 64);
  if (!/^[a-f0-9]{64}$/u.test(directory))
    throw new AccountError(400, 'Diretório inválido.');
  return {
    directory,
    payload: object(data['payload']),
    signature: boundedText(data['signature'], 128),
  };
}
export function publicProfileBody(
  account: string,
  device: string,
  operation: string,
  proof: { directory: string; payload: Record<string, unknown> },
): string {
  return canonical([
    '0xdmme-public-profile',
    1,
    account,
    device,
    operation,
    proof,
  ]);
}
