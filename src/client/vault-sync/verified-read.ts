import type { VaultAuthority } from '../vault-authority/index.ts';
import { messageApi } from '../message-api/index.ts';
import { ApiResponseError } from '../api-response/index.ts';
import { keys, object } from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';

/** In-process evidence only; no keys, account identifiers or serialized cache. */
export interface VerifiedVaultRead {
  confirm: (authority: VaultAuthority) => Promise<boolean>;
}

export interface VaultReadVersion {
  generation: number;
  accountId: string;
  deviceId: string;
  csrf: string;
  directory: string;
  sequence: number;
  head: string | null;
  removal: number;
}

/** One capability check per VaultSync lifetime on older servers. The combined
 * read never updates the local heads or removal index from cursor values. */
export class VaultIdentitySnapshot {
  private available = true;

  async read(authority: VaultAuthority, guard: () => void) {
    if (!this.available) return null;
    let raw: unknown;
    try {
      raw = await messageApi(authority, 'identity-snapshot', {}, guard);
    } catch (error: unknown) {
      if (
        !(error instanceof ApiResponseError) ||
        error.status !== 404 ||
        error.reason !== 'Message operation unavailable.'
      )
        throw error;
      guard();
      this.available = false;
      return null;
    }
    const data = object(raw);
    keys(data, ['sequence', 'head', 'removal']);
    return {
      sequence: integer(data['sequence']),
      head: data['head'] === null ? null : fingerprint(data['head']),
      removal: integer(data['removal'], Number.MAX_SAFE_INTEGER),
    };
  }
}

export function sameVaultRead(
  left: VaultReadVersion,
  right: VaultReadVersion | null,
): boolean {
  return (
    right !== null &&
    left.generation === right.generation &&
    left.accountId === right.accountId &&
    left.deviceId === right.deviceId &&
    left.csrf === right.csrf &&
    left.directory === right.directory &&
    left.sequence === right.sequence &&
    left.head === right.head &&
    left.removal === right.removal
  );
}
