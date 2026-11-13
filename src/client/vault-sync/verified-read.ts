import type { VaultAuthority } from '../vault-authority/index.ts';

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
