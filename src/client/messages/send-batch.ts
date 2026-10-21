import { canonical } from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';

interface SendTarget {
  id: string;
  peer: string;
}

/** A verified directory belongs only to these admitted drafts and this authority
 * observation. It never becomes a controller/session cache or grants authority. */
export class PinnedSendBatch {
  readonly names: readonly string[];
  private readonly authority: string;
  private readonly targets: Map<string, SendTarget>;
  private readonly histories = new Map<string, DirectoryEvent[]>();

  private constructor(
    authority: VaultAuthority,
    entries: { name: string; value: SendTarget }[],
  ) {
    this.authority = authorityStamp(authority);
    this.names = entries.map((entry) => entry.name);
    this.targets = new Map(
      entries.map(({ name, value }) => [
        name,
        { id: value.id, peer: value.peer },
      ]),
    );
  }

  static async prepare(input: {
    authority: VaultAuthority;
    entries: { name: string; value: SendTarget }[];
    history: (peer: string) => Promise<DirectoryEvent[]>;
  }): Promise<PinnedSendBatch> {
    if (input.entries.length > 16)
      throw new Error('Pending message batch exceeds the limit.');
    const batch = new PinnedSendBatch(input.authority, input.entries);
    for (const peer of new Set(input.entries.map((entry) => entry.value.peer)))
      batch.histories.set(peer, await input.history(peer));
    return batch;
  }

  current(authority: VaultAuthority): boolean {
    return this.authority === authorityStamp(authority);
  }

  history(name: string, value: SendTarget): DirectoryEvent[] {
    const target = this.targets.get(name),
      history = this.histories.get(value.peer);
    if (
      !target ||
      target.id !== value.id ||
      target.peer !== value.peer ||
      !history
    )
      throw new Error('Pending message differs from its verified send batch.');
    return history;
  }
}

function authorityStamp(authority: VaultAuthority): string {
  return canonical([
    authority.session.accountId,
    authority.session.deviceId,
    authority.session.csrf,
    authority.directory,
    authority.epoch,
  ]);
}

/** Pin persistence must release the vault lock. A changed authority restarts the
 * bounded preflight before the SDK can distribute keys or publish ciphertext. */
export async function sendPinnedBatch(input: {
  prepare: () => Promise<PinnedSendBatch>;
  preserve: () => Promise<void>;
  transmit: (batch: PinnedSendBatch) => Promise<boolean>;
}): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const batch = await input.prepare();
    if (!batch.names.length) return;
    await input.preserve();
    if (await input.transmit(batch)) return;
  }
  throw new Error('Devices changed during sending. Try again.');
}
