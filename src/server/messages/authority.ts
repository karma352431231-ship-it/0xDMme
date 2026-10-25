import { AccountError } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { directoryEvent, verify } from '../../shared/devices/index.ts';
import { messageProof, messageBody } from '../../shared/messages/index.ts';
import type { MessageProof } from '../../shared/messages/index.ts';
import type { DeviceStore } from '../database/index.ts';
/** Stateless authority boundary: every request rereads the current directory.
 * Domain ACLs and transactional revalidation remain with their existing stores. */
export class MessageAuthority {
  private readonly devices: Pick<DeviceStore, 'current'>;
  constructor(devices: Pick<DeviceStore, 'current'>) {
    this.devices = devices;
  }
  async authenticate(
    operation: string,
    session: AccountSession,
    input: unknown,
  ) {
    const proof = messageProof(input),
      current = await this.devices.current(session.accountId);
    const signer =
      current &&
      directoryEvent(current.event).devices.find(
        (d) => d.id === session.deviceId,
      );
    if (
      !signer ||
      proof.deviceId !== session.deviceId ||
      current?.head !== proof.directory
    )
      throw new AccountError(403, 'Device has no current authorization.');
    await verify(
      signer.signing,
      proof.signature,
      messageBody(session.accountId, session.deviceId, operation, proof),
    );
    if (!current)
      throw new AccountError(403, 'Device has no current authorization.');
    return { proof, current };
  }
  async liveCurrent(session: AccountSession, head: string): Promise<boolean> {
    const current = await this.devices.current(session.accountId);
    return (
      current?.head === head &&
      directoryEvent(current.event).devices.some(
        (device) => device.id === session.deviceId,
      )
    );
  }
  checkDeletionRevision(
    operation: string,
    proof: MessageProof,
    revision: number,
  ): void {
    if (operation === 'delete' && proof.payload['revision'] !== revision)
      throw new AccountError(409, 'Deletion authority does not match.');
  }
}
