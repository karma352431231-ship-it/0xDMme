import { DeviceController } from './controller.ts';
import { storedIdentity } from '../device-storage/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
  VaultWorkOptions,
} from '../vault-authority/index.ts';

/** Reuses current online authority and the existing cross-context SDK lock.
 * Never enrolls a device, opens offline, persists new keys or recovers a wallet. */
export class BackgroundVaultAccess implements VaultAccess {
  private readonly controller = new DeviceController();
  private readonly session: AccountSession;
  private readonly signal: AbortSignal;
  constructor(session: AccountSession, signal: AbortSignal) {
    this.session = session;
    this.signal = signal;
    this.controller.setSession(session);
    signal.addEventListener('abort', () => this.close(), { once: true });
  }
  close(): void {
    this.controller.setSession(null);
  }
  async withVault<T>(
    offline: boolean,
    work: (authority: VaultAuthority) => Promise<T>,
    options: VaultWorkOptions = {},
  ): Promise<T> {
    this.signal.throwIfAborted();
    if (offline) throw new Error('Push requires online authority.');
    await storedIdentity(this.session.accountId, this.session.deviceId);
    this.signal.throwIfAborted();
    return this.controller.withVault(
      false,
      async (authority) => {
        this.signal.throwIfAborted();
        const result = await work({
          ...authority,
          sign: (proof) => {
            this.signal.throwIfAborted();
            return authority.sign(proof);
          },
        });
        this.signal.throwIfAborted();
        return result;
      },
      options,
    );
  }
  withLocalVault<T>(): Promise<T> {
    return Promise.reject(new Error('Push cannot use offline authority.'));
  }
}
