import { keys, object } from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import {
  integer,
  pageSize,
  vaultCommit,
  vaultQuota,
} from '../../shared/vault/index.ts';
import type { VaultCommit } from '../../shared/vault/index.ts';
export interface VaultPage {
  sequence: number;
  head: string | null;
  used: number;
  commits: VaultCommit[];
  pending: VaultCommit[];
}
export function readPage(value: unknown): VaultPage {
  const data = object(value);
  keys(data, ['sequence', 'head', 'used', 'commits', 'pending']);
  const commits = data['commits'];
  const pending = data['pending'];
  if (
    !Array.isArray(commits) ||
    commits.length > pageSize ||
    !Array.isArray(pending) ||
    pending.length > 4
  )
    throw new Error('Página de cofre inválida.');
  return {
    sequence: integer(data['sequence']),
    head: data['head'] === null ? null : fingerprint(data['head']),
    used: integer(data['used'], vaultQuota),
    commits: (commits as unknown[]).map(vaultCommit),
    pending: (pending as unknown[]).map(vaultCommit),
  };
}
