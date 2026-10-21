import { ensureMessageRecovery } from '../message-recovery/index.ts';
import { openMessageMachine } from '../message-session/index.ts';
import type { MessageCrypto } from '../message-crypto/index.ts';
import type { PeerIdentity } from '../peer-identity/index.ts';
import { readGroupPage } from './reader.ts';
import type { GroupContext } from './authority.ts';
import type { GroupState } from './governance.ts';
interface ReadLeaseContext extends GroupContext {
  group: GroupState;
  identities: PeerIdentity;
}
/** Index-only turns never initialize an SDK. Packet reads in one exclusive
 * authority turn share one machine; a borrowed foreground machine stays owned
 * by its caller. No lease survives a continuation boundary. */
export class GroupMessageLease {
  private readonly context: ReadLeaseContext;
  private readonly borrowed: boolean;
  private machine: MessageCrypto | null;
  constructor(context: ReadLeaseContext, machine?: MessageCrypto) {
    this.context = context;
    this.machine = machine ?? null;
    this.borrowed = machine !== undefined;
  }
  async read(raw: unknown) {
    const c = this.context,
      machine = await this.open();
    const result = await readGroupPage({ ...c, machine }, raw);
    if (result.receipts.length)
      await c.api('group-message-received', {
        groupId: c.group.state.groupId,
        head: c.group.head,
        items: result.receipts,
      });
    return result;
  }
  private async open(): Promise<MessageCrypto> {
    if (this.machine) return this.machine;
    const c = this.context;
    await ensureMessageRecovery(c.authority, c.api);
    this.machine = await openMessageMachine(c.authority, c.api);
    await this.machine.prepare(c.authority);
    return this.machine;
  }
  close(): void {
    if (!this.borrowed) this.machine?.close();
    this.machine = null;
  }
}
