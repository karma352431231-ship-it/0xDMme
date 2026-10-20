import {
  callContext,
  callDescription,
  descriptionBody,
} from '../../shared/calls/index.ts';
import type { CallView, CallDescription } from '../../shared/calls/index.ts';
import { eventHash, verify } from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { sealTo } from '../device-keys/index.ts';
import { CallIdentity } from '../call-identity/index.ts';
import type { SigningAuthority } from '../message-api/index.ts';
import { leaseMs } from '../../shared/calls/index.ts';

export class CallSecurity {
  private readonly identities: CallIdentity;
  private prepared: {
    peer: string;
    directory: DirectoryEvent;
    a: SigningAuthority;
    until: number;
    stamp: string;
  } | null = null;
  private generation = 0;
  constructor(access: VaultAccess, sync: VaultSync) {
    this.identities = new CallIdentity(access, sync);
    this.identities.enable(false);
  }
  prime(): Promise<void> {
    return this.identities.prime();
  }
  setContext(enabled: boolean): void {
    this.identities.enable(enabled);
  }
  clear(): void {
    this.generation++;
    this.prepared = null;
    this.identities.clear();
  }
  private guard(g: number): void {
    if (g !== this.generation) throw new Error('Call identity changed.');
  }
  async directory(peer: string): Promise<DirectoryEvent> {
    const until = Date.now() + leaseMs,
      g = this.generation;
    const result = await this.identities.withPeer(peer, (a, directory) =>
      Promise.resolve({
        directory,
        a: { session: { ...a.session }, directory: a.directory, sign: a.sign },
      }),
    );
    this.guard(g);
    const stamp = this.identities.current;
    this.prepared = stamp ? { ...result, peer, until, stamp } : null;
    return result.directory;
  }
  async seal(input: {
    view: CallView;
    devices: string[];
    sequence: number;
    type: CallDescription['type'];
    sdp: string;
  }) {
    const g = this.generation;
    const prepared = this.prepared;
    if (
      input.sequence <= 1 &&
      prepared &&
      prepared.peer === input.view.peer &&
      Date.now() < prepared.until &&
      prepared.stamp === this.identities.current
    ) {
      return this.encrypt(prepared.a, prepared.directory, input);
    }
    return this.identities.withPeer(input.view.peer, async (a, peer) => {
      this.guard(g);
      return this.encrypt(a, peer, input);
    });
  }
  private async encrypt(
    a: SigningAuthority,
    peer: DirectoryEvent,
    input: {
      view: CallView;
      devices: string[];
      sequence: number;
      type: CallDescription['type'];
      sdp: string;
    },
  ) {
    const g = this.generation;
    if ((await eventHash(peer)) !== input.view.peerDirectory)
      throw new Error("The contact's devices changed.");
    const packets = [];
    for (const id of input.devices) {
      this.guard(g);
      const device = peer.devices.find((d) => d.id === id);
      if (!device) throw new Error("The contact's device is not authorized.");
      const body: Omit<CallDescription, 'signature'> = {
        id: input.view.id,
        from: a.session.accountId,
        fromDevice: a.session.deviceId,
        to: input.view.peer,
        toDevice: id,
        fromDirectory: a.directory,
        toDirectory: input.view.peerDirectory,
        sequence: input.sequence,
        type: input.type,
        sdp: input.sdp,
      };
      const signed = {
        ...body,
        signature: await a.sign(descriptionBody(body)),
      };
      packets.push({
        device: id,
        body: await sealTo(
          device.wrapping,
          signed,
          callContext(input.view.id, id),
        ),
      });
    }
    this.guard(g);
    return packets;
  }
  async open(view: CallView): Promise<CallDescription> {
    const g = this.generation;
    return this.identities.withPeer(view.peer, async (a, peer) => {
      if ((await eventHash(peer)) !== view.peerDirectory)
        throw new Error('Call directory does not match.');
      const envelope = view.signal ?? view.invitation;
      if (!envelope || !a.openSecret)
        throw new Error('Protected signaling unavailable.');
      const d = callDescription(
        await a.openSecret(envelope, callContext(view.id, a.session.deviceId)),
      );
      const signer = peer.devices.find((p) => p.id === d.fromDevice);
      if (!signer) throw new Error("The contact's device was revoked.");
      await verifyCallDescription(
        d,
        {
          view,
          account: a.session.accountId,
          device: a.session.deviceId,
          directory: a.directory,
          invitation: !view.signal,
        },
        signer.signing,
      );
      this.guard(g);
      return d;
    });
  }
}
export async function verifyCallDescription(
  d: CallDescription,
  binding: Omit<Parameters<typeof assertDescription>[0], 'd'>,
  signing: string,
): Promise<void> {
  assertDescription({ ...binding, d });
  const { signature, ...body } = d;
  await verify(signing, signature, descriptionBody(body));
}
export function assertDescription(c: {
  d: CallDescription;
  view: CallView;
  account: string;
  device: string;
  directory: string;
  invitation?: boolean;
}): void {
  const { d, view } = c;
  assertInvitation(c);
  if (
    d.id !== view.id ||
    d.from !== view.peer ||
    d.fromDevice !== view.peerDevice ||
    d.to !== c.account ||
    d.toDevice !== c.device
  )
    throw new Error('Call endpoints do not match.');
  assertNegotiation(d, view, c.directory, c.invitation === true);
}
function assertInvitation(c: Parameters<typeof assertDescription>[0]): void {
  const { view } = c;
  if (
    c.invitation &&
    (view.caller || !view.invitation || view.signal || view.sequence !== 0)
  )
    throw new Error('Call invitation mismatch.');
}
function assertNegotiation(
  d: CallDescription,
  view: CallView,
  directory: string,
  invitation: boolean,
): void {
  if (
    d.sequence !== (invitation ? 0 : view.sequence) ||
    d.fromDirectory !== view.peerDirectory ||
    d.toDirectory !== directory ||
    d.type !== (invitation ? 'invite' : view.caller ? 'answer' : 'offer')
  )
    throw new Error('Negotiation outdated or from another device.');
}
