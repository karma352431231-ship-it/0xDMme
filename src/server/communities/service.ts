import { AccountError, uuid } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { directoryEvent, verify } from '../../shared/devices/index.ts';
import {
  communityBody,
  communityCursor,
  communityProof,
} from '../../shared/communities/index.ts';
import type { CommunityStore, DeviceStore } from '../database/index.ts';
export class CommunityService {
  private readonly store: CommunityStore;
  private readonly devices: DeviceStore;
  constructor(store: CommunityStore, devices: DeviceStore) {
    this.store = store;
    this.devices = devices;
  }
  read(id: unknown) {
    return this.store.read(uuid(id));
  }
  list(after: unknown) {
    return this.store.list(communityCursor(after));
  }
  async operate(
    operation: string,
    session: AccountSession,
    input: unknown,
  ): Promise<unknown> {
    const proof = communityProof(input),
      current = await this.devices.current(session.accountId);
    const signer =
      current &&
      directoryEvent(current.event).devices.find(
        (device) => device.id === session.deviceId,
      );
    if (!signer || current?.head !== proof.directory)
      throw new AccountError(403, 'Aparelho sem autorização atual.');
    await verify(
      signer.signing,
      proof.signature,
      communityBody(session.accountId, session.deviceId, operation, {
        directory: proof.directory,
        payload: proof.payload,
      }),
    );
    return this.store.operate(
      operation,
      { session, directory: proof.directory },
      proof.payload,
    );
  }
}
