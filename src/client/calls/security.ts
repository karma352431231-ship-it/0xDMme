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
import { messageApi } from '../message-api/index.ts';
import { sealTo } from '../device-keys/index.ts';
import { PeerIdentity, peerHistory } from '../peer-identity/index.ts';

export class CallSecurity {
  private readonly access: VaultAccess;
  private readonly identities: PeerIdentity;
  private generation = 0;
  constructor(access: VaultAccess, sync: VaultSync) {
    this.access = access;
    this.identities = new PeerIdentity(sync);
  }
  clear(): void {
    this.generation++;
    this.identities.clear();
  }
  private guard(g: number): void {
    if (g !== this.generation) throw new Error('Identidade da chamada mudou.');
  }
  async directory(peer: string): Promise<DirectoryEvent> {
    const g = this.generation;
    await this.identities.load();
    this.guard(g);
    const events = await this.access.withVault(false, (a) =>
      peerHistory(
        (op, d) => messageApi(a, op, d, () => this.guard(g)),
        peer,
        null,
        this.identities.get(peer),
      ),
    );
    await this.identities.remember(peer, events);
    await this.identities.save();
    this.guard(g);
    const last = events.at(-1);
    if (!last) throw new Error('Identidade do contato ausente.');
    return last;
  }
  async seal(input: {
    view: CallView;
    devices: string[];
    sequence: number;
    type: CallDescription['type'];
    sdp: string;
  }) {
    const g = this.generation;
    const peer = await this.directory(input.view.peer);
    if ((await eventHash(peer)) !== input.view.peerDirectory)
      throw new Error('Aparelhos do contato mudaram.');
    return this.access.withVault(false, async (a) => {
      const packets = [];
      for (const id of input.devices) {
        this.guard(g);
        const device = peer.devices.find((d) => d.id === id);
        if (!device) throw new Error('Aparelho do contato não autorizado.');
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
    });
  }
  async open(view: CallView): Promise<CallDescription> {
    const g = this.generation;
    const peer = await this.directory(view.peer);
    if ((await eventHash(peer)) !== view.peerDirectory)
      throw new Error('Diretório da chamada divergente.');
    return this.access.withVault(false, async (a) => {
      if (!view.signal || !a.openSecret)
        throw new Error('Sinalização protegida indisponível.');
      const d = callDescription(
        await a.openSecret(
          view.signal,
          callContext(view.id, a.session.deviceId),
        ),
      );
      const signer = peer.devices.find((p) => p.id === d.fromDevice);
      if (!signer) throw new Error('Aparelho do contato revogado.');
      await verifyCallDescription(
        d,
        {
          view,
          account: a.session.accountId,
          device: a.session.deviceId,
          directory: a.directory,
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
}): void {
  const { d, view } = c;
  if (
    d.id !== view.id ||
    d.from !== view.peer ||
    d.fromDevice !== view.peerDevice ||
    d.to !== c.account ||
    d.toDevice !== c.device
  )
    throw new Error('Extremos da chamada divergentes.');
  assertNegotiation(d, view, c.directory);
}
function assertNegotiation(
  d: CallDescription,
  view: CallView,
  directory: string,
): void {
  if (
    d.sequence !== view.sequence ||
    d.fromDirectory !== view.peerDirectory ||
    d.toDirectory !== directory ||
    d.type !== (view.caller ? 'answer' : 'offer')
  )
    throw new Error('Negociação antiga ou de outro aparelho.');
}
