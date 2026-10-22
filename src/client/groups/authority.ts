import {
  backupMessageApi,
  messageApi,
  rateLimitPause,
  rateLimited,
} from '../message-api/index.ts';
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
  /** Signed governance and message mutations keep the per-request retry. */
  mutate<T>(work: (context: GroupContext) => Promise<T>): Promise<T> {
    const generation = this.generation;
    const guard = () => {
      if (generation !== this.generation)
        throw new Error('Account authorization changed.');
    };
    return this.once(guard, work, (authority, op, payload) =>
      backupMessageApi(authority, op, payload, guard),
    );
  }
  /** Reads and idempotent publications wait out a rate limit after releasing
   * the vault, which other account work shares, then run again under freshly
   * verified authority. */
  async run<T>(
    guard: () => void,
    work: (context: GroupContext) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once(guard, work, (authority, op, payload) =>
          messageApi(authority, op, payload, guard),
        );
      } catch (error: unknown) {
        if (!rateLimited(error) || attempt >= 2) throw error;
        await rateLimitPause(guard);
      }
    }
  }
  private async once<T>(
    guard: () => void,
    work: (context: GroupContext) => Promise<T>,
    request: (
      authority: VaultAuthority,
      op: string,
      payload: Record<string, unknown>,
    ) => Promise<unknown>,
  ): Promise<T> {
    const session = this.options.session();
    if (!session) throw new Error('Sign in and authorize this device.');
    return this.options.access.withVault(
      !navigator.onLine,
      async (authority) => {
        guard();
        if (
          authority.session.accountId !== session.accountId ||
          authority.session.deviceId !== session.deviceId ||
          authority.session.csrf !== session.csrf
        )
          throw new Error('Account changed.');
        const api: AttachmentApi = (op, payload) =>
          request(authority, op, payload);
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
