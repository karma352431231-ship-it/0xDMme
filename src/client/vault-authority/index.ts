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
export interface VaultAccess {
  withVault: <T>(
    offline: boolean,
    work: (authority: VaultAuthority) => Promise<T>,
  ) => Promise<T>;
  withLocalVault: <T>(
    locator: VaultLocator,
    work: (authority: VaultAuthority) => Promise<T>,
  ) => Promise<T>;
}
export interface VaultLocator {
  accountId: string;
  deviceId: string;
}
