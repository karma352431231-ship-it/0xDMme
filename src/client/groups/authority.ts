import { backupMessageApi } from '../message-api/index.ts';
import type { AttachmentApi } from '../attachments/index.ts';
import type { PeerIdentity } from '../peer-identity/index.ts';
import type { VaultAccess, VaultAuthority } from '../vault-authority/index.ts';
import { GroupGovernance } from './governance.ts';

export interface GroupContext {
  authority: VaultAuthority;
  api: AttachmentApi;
  governance: GroupGovernance;
}
interface AuthorityOptions {
  access: VaultAccess;
  identities: PeerIdentity;
  session: () => VaultAuthority['session'] | null;
}
/** A membership wakeup invalidates displayed history, not the acknowledgement
 * of its own committed mutation. Session changes/revocation cancel both. Every
 * request still carries the current signed device/group authority. */
export class GroupAuthority {
  private readonly options: AuthorityOptions;
  private generation = 0;
  constructor(options: AuthorityOptions) {
    this.options = options;
  }
  invalidate(): void {
    this.generation++;
  }
  mutate<T>(work: (context: GroupContext) => Promise<T>): Promise<T> {
    const generation = this.generation;
    return this.run(() => {
      if (generation !== this.generation)
        throw new Error('Autorização da conta alterada.');
    }, work);
  }
  async run<T>(
    guard: () => void,
    work: (context: GroupContext) => Promise<T>,
  ): Promise<T> {
    const session = this.options.session();
    if (!session) throw new Error('Entre e autorize este aparelho.');
    return this.options.access.withVault(
      !navigator.onLine,
      async (authority) => {
        guard();
        if (
          authority.session.accountId !== session.accountId ||
          authority.session.deviceId !== session.deviceId ||
          authority.session.csrf !== session.csrf
        )
          throw new Error('Conta alterada.');
        const api: AttachmentApi = (op, payload) =>
          backupMessageApi(authority, op, payload, guard);
        const governance = new GroupGovernance(
          this.options.identities,
          api,
          authority,
        );
        const result = await work({ authority, api, governance });
        guard();
        return result;
      },
    );
  }
}
