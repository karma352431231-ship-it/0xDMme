import type { AccountSession } from '../../shared/account/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import type { SealedSecret } from '../../shared/devices/index.ts';
export interface VaultAuthority {
  session: Pick<AccountSession, 'accountId' | 'deviceId' | 'csrf'>;
  offline: boolean;
  directory: string;
  epoch: number;
  events: DirectoryEvent[];
  key: (epoch: number) => Promise<CryptoKey>;
  sign: (proof: string) => Promise<string>;
  openSecret?: (envelope: SealedSecret, context: unknown[]) => Promise<unknown>;
}
/** Only what a signed request needs; no vault keys or secret opening. */
export type SigningAuthority = Pick<
  VaultAuthority,
  'session' | 'directory' | 'sign'
>;
export interface VaultAccess {
  /** Work that only signs requests, outside the exclusive account turn when
   * the implementation supports it. */
  withSigner?: <T>(
    work: (authority: SigningAuthority) => Promise<T>,
  ) => Promise<T>;
  withVault: <T>(
    offline: boolean,
    work: (authority: VaultAuthority) => Promise<T>,
    options?: VaultWorkOptions,
  ) => Promise<T>;
  withLocalVault: <T>(
    locator: VaultLocator,
    work: (authority: VaultAuthority) => Promise<T>,
  ) => Promise<T>;
}
export interface VaultWorkOptions {
  priority?: 'interactive';
}
export interface VaultLocator {
  accountId: string;
  deviceId: string;
}

/** Signs outside the exclusive turn where supported, else inside one. */
export function withSigner<T>(
  access: VaultAccess,
  work: (authority: SigningAuthority) => Promise<T>,
): Promise<T> {
  return access.withSigner
    ? access.withSigner(work)
    : access.withVault(false, work);
}
