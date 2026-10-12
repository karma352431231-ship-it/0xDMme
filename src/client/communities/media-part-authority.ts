import type { VaultAccess } from '../vault-authority/index.ts';
import type { CommunitySigner } from './signed-request.ts';

/** One short-lived signing context; no content keys, secret-opening API or account lock retained. */
export class MediaPartAuthority {
  private readonly access: VaultAccess;
  private pending: Promise<CommunitySigner> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private expiresAt = 0;
  private uses = 0;
  constructor(access: VaultAccess) {
    this.access = access;
  }
  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    this.expiresAt = 0;
    this.uses = 0;
  }
  get(): Promise<CommunitySigner> {
    if (this.pending && Date.now() < this.expiresAt && this.uses < 16) {
      this.uses++;
      return this.pending;
    }
    this.clear();
    const pending = this.access.withVault(false, (authority) =>
      Promise.resolve({
        session: {
          accountId: authority.session.accountId,
          deviceId: authority.session.deviceId,
          csrf: authority.session.csrf,
        },
        directory: authority.directory,
        sign: authority.sign,
      }),
    );
    this.pending = pending;
    this.uses = 1;
    this.expiresAt = Number.MAX_SAFE_INTEGER;
    void pending.then(
      () => {
        if (this.pending !== pending) return;
        this.expiresAt = Date.now() + 3000;
        this.timer = setTimeout(() => this.clear(), 3000);
        this.timer.unref?.();
      },
      () => {
        if (this.pending === pending) this.clear();
      },
    );
    return pending;
  }
}
