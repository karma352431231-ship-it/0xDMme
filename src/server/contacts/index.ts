import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  contactBody,
  contactList,
  contactProof,
  discoveryMode,
  invitation,
  revision,
  token,
  walletContact,
} from '../../shared/contacts/index.ts';
import { directoryEvent, verify } from '../../shared/devices/index.ts';
import type {
  ContactAuthority,
  ContactStore,
  DeviceStore,
} from '../database/index.ts';
type Operation = (
  authority: ContactAuthority,
  data: Record<string, unknown>,
) => Promise<unknown>;
function decision(data: Record<string, unknown>, field: string): boolean {
  const value = data[field];
  if (typeof value !== 'boolean')
    throw new AccountError(400, 'Decisão inválida.');
  return value;
}
export class ContactService {
  private readonly store: ContactStore;
  private readonly devices: DeviceStore;
  private readonly operations: Record<string, Operation>;
  constructor(store: ContactStore, devices: DeviceStore) {
    this.store = store;
    this.devices = devices;
    this.operations = {
      state: (a, d) => {
        keys(d, []);
        return store.state(a);
      },
      snapshot: (a, d) => {
        keys(d, []);
        return store.snapshot(a);
      },
      list: (a, d) => this.list(a, d),
      discover: (a, d) => store.discover(a, walletContact(d)),
      invite: (a, d) => {
        const i = invitation(d);
        return store.inspectInvite(a, i.owner, i.token);
      },
      configure: (a, d) => this.configure(a, d),
      request: (a, d) => this.request(a, d),
      respond: (a, d) => {
        keys(d, ['revision', 'target', 'accept']);
        return store.respond(a, {
          revision: revision(d['revision']),
          target: uuid(d['target']),
          accept: decision(d, 'accept'),
        });
      },
      block: (a, d) => {
        keys(d, ['revision', 'wallet', 'blocked']);
        return store.block(a, {
          revision: revision(d['revision']),
          wallet: walletContact(d['wallet']),
          blocked: decision(d, 'blocked'),
        });
      },
      directory: (a, d) => {
        keys(d, ['target', 'after']);
        return store.directory(a, uuid(d['target']), revision(d['after']));
      },
      unblock: (a, d) => {
        keys(d, ['revision', 'walletHash']);
        return store.unblock(a, {
          revision: revision(d['revision']),
          walletHash: token(d['walletHash']),
        });
      },
      cancel: (a, d) => {
        keys(d, ['revision', 'target']);
        return store.cancel(a, {
          revision: revision(d['revision']),
          target: uuid(d['target']),
        });
      },
    };
  }
  async operate(
    operation: string,
    session: AccountSession,
    input: unknown,
  ): Promise<unknown> {
    const action = Object.hasOwn(this.operations, operation)
      ? this.operations[operation]
      : undefined;
    if (!action)
      throw new AccountError(404, 'Operação de contato não encontrada.');
    const proof = contactProof(input),
      current = await this.devices.current(session.accountId);
    const signer =
      current &&
      directoryEvent(current.event).devices.find(
        (d) => d.id === session.deviceId,
      );
    if (!signer || current?.head !== proof.directory)
      throw new AccountError(403, 'Aparelho sem autorização atual.');
    await verify(
      signer.signing,
      proof.signature,
      contactBody(session.accountId, session.deviceId, operation, proof),
    );
    const result = await action(
      { session, directory: proof.directory },
      proof.payload,
    );
    return result === undefined ? { status: 'saved' } : result;
  }
  private async list(
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    keys(data, ['kind', 'after']);
    const kind = contactList(data['kind']);
    const after =
      data['after'] === null
        ? null
        : kind === 'blocked'
          ? token(data['after'])
          : uuid(data['after']);
    return this.store.list(authority, kind, after);
  }
  private async configure(
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    keys(data, ['revision', 'mode', 'inviteHash']);
    return this.store.configure(authority, {
      revision: revision(data['revision']),
      mode: discoveryMode(data['mode']),
      inviteHash:
        data['inviteHash'] === null ? null : token(data['inviteHash']),
    });
  }
  private async request(
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ): Promise<void> {
    keys(data, ['revision', 'target', 'invite']);
    return this.store.request(authority, {
      revision: revision(data['revision']),
      target: uuid(data['target']),
      invite: data['invite'] === null ? null : token(data['invite']),
    });
  }
}
