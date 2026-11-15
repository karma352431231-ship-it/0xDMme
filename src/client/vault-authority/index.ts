import type { AuthorityDiagnosticContext } from '../../shared/chat-sync-diagnostics/flow.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import type { SealedSecret } from '../../shared/devices/index.ts';
export interface VaultAuthority {
  session: Pick<AccountSession, 'accountId' | 'deviceId' | 'csrf'>;
  offline: boolean;
  /** Send-specific reuse. Full preparation must reacquire online verification. */
  reusedOwnDirectory?: true;
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
  /** Immutable local keys for encrypted outgoing staging. No SDK, networking,
   * vault synchronization or checkpoint mutation is allowed inside this work. */
  withDraftVault?: <T>(
    locator: VaultLocator,
    work: (authority: VaultAuthority) => Promise<T>,
    options?: VaultWorkOptions,
  ) => Promise<T>;
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
    options?: VaultWorkOptions,
  ) => Promise<T>;
}
export interface VaultWorkOptions extends AuthorityDiagnosticContext {
  priority?: 'interactive';
  /** Refusal-driven own-directory reuse for the idempotent send workflow. */
  ownDirectory?: 'reuse' | 'fresh';
}
export interface VaultLocator {
  accountId: string;
  deviceId: string;
}

/** Legacy access adapters keep their serialized local operation. */
export function withDraftVault<T>(
  access: VaultAccess,
  locator: VaultLocator,
  work: (authority: VaultAuthority) => Promise<T>,
  options: VaultWorkOptions = {},
): Promise<T> {
  return access.withDraftVault
    ? access.withDraftVault(locator, work, options)
    : access.withLocalVault(locator, work, options);
}

/** Signs outside the exclusive turn where supported, else inside one. */
export function withSigner<T>(
  access: VaultAccess,
  work: (authority: SigningAuthority) => Promise<T>,
  options: VaultWorkOptions = {},
): Promise<T> {
  return access.withSigner
    ? access.withSigner(work)
    : access.withVault(false, work, options);
}
