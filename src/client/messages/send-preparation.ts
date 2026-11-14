import { eventHash } from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import type { RecoveryKey } from '../../shared/messages/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import type { Api, PeerIdentity } from '../peer-identity/index.ts';
import { SendMaterials } from '../send-material/index.ts';
import {
  SendPreparationRead,
  preparedRecovery,
} from '../send-preparation/index.ts';
import type { SendPreparation } from './send-batch.ts';

/** Owns full preparation versus reuse. Histories and pins stay with PeerIdentity. */
export class PrivateSendPreparation {
  private read = new SendPreparationRead();
  private readonly material = new SendMaterials();
  private readonly identities: PeerIdentity;
  constructor(identities: PeerIdentity) {
    this.identities = identities;
  }

  async prepare(
    a: VaultAuthority,
    peer: string,
    ports: {
      api: Api;
      history: (
        api: Api,
        prefix?: DirectoryEvent[],
      ) => Promise<DirectoryEvent[]>;
    },
  ): Promise<SendPreparation> {
    const retention = this.material.generation;
    const reusable = this.reusable(a, peer);
    if (reusable) return { ...reusable, retention };
    const history = this.identities.history(peer);
    const pin = this.identities.get(peer);
    const prefix = pin && history ? history.slice(0, pin.revision) : [];
    const after = prefix.length;
    const response = await this.read.read(ports.api, 'send-preparation', {
      accountId: peer,
      after,
    });
    if (response === null)
      return { history: await ports.history(ports.api), recovery: null };
    let used = false;
    const verified = await ports.history((op, data) => {
      if (op !== 'peer-directory' || data['after'] !== after || used)
        return ports.api(op, data);
      used = true;
      return Promise.resolve(response['directory']);
    }, prefix);
    return {
      history: verified,
      recovery: preparedRecovery(response),
      retention,
    };
  }
  private reusable(a: VaultAuthority, peer: string): SendPreparation | null {
    const known = this.material.reusable(a, peer);
    const history = this.identities.history(peer);
    const own = known?.participants.find(
      (p) => p.accountId === a.session.accountId,
    );
    const recipient = known?.participants.find((p) => p.accountId === peer);
    if (
      !history ||
      !own ||
      !recipient ||
      this.identities.get(peer)?.directory !== recipient.directory
    )
      return null;
    return {
      history,
      recovery: { own: own.recovery, peer: recipient.recovery },
      reused: true,
    };
  }
  /** Called after the crypto owner verified recovery, trust and encryption. */
  async encrypted(
    a: VaultAuthority,
    input: {
      peer: string;
      history: DirectoryEvent[];
      own: RecoveryKey;
      recipient: RecoveryKey;
      retention: number | undefined;
    },
  ): Promise<void> {
    const event = input.history.at(-1);
    if (!event) throw new Error('Contact directory missing.');
    this.material.remember(
      a,
      input.peer,
      {
        scope: input.peer,
        participants: [
          {
            accountId: a.session.accountId,
            directory: a.directory,
            revision: a.events.length,
            recovery: input.own,
          },
          {
            accountId: input.peer,
            directory: await eventHash(event),
            revision: event.revision,
            recovery: input.recipient,
          },
        ],
      },
      input.retention,
    );
  }
  observed(account: string, head: string): void {
    this.material.observed(account, head);
  }
  invalidate(peer?: string): void {
    this.material.invalidate(peer);
  }
  reset(): void {
    this.material.invalidate();
    this.read = new SendPreparationRead();
  }
}
