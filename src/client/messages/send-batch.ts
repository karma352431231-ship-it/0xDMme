import { sendAuthorityStamp } from '../send-material/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';

interface SendTarget {
  id: string;
  peer: string;
}

export interface SendPreparation {
  history: DirectoryEvent[];
  reused?: boolean;
  retention?: number;
  recovery: { own: unknown; peer: unknown } | null;
}

/** Verified preparation belongs only to these admitted drafts and this authority
 * observation. Inputs may come from session material tied to the same authority.
 * This carrier remains batch-scoped and grants no authority. */
export class PinnedSendBatch {
  readonly names: readonly string[];
  private readonly authority: string;
  private readonly targets: Map<string, SendTarget>;
  private readonly preparations = new Map<string, SendPreparation>();

  private constructor(
    authority: VaultAuthority,
    entries: { name: string; value: SendTarget }[],
  ) {
    this.authority = sendAuthorityStamp(authority);
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
    preparation: (peer: string) => Promise<SendPreparation>;
  }): Promise<PinnedSendBatch> {
    if (input.entries.length > 16)
      throw new Error('Pending message batch exceeds the limit.');
    const batch = new PinnedSendBatch(input.authority, input.entries);
    for (const peer of new Set(input.entries.map((entry) => entry.value.peer)))
      batch.preparations.set(peer, await input.preparation(peer));
    return batch;
  }

  ownRecovery(): { raw: unknown } | undefined {
    const first = this.preparations.values().next().value?.recovery;
    return first ? { raw: first.own } : undefined;
  }

  current(authority: VaultAuthority): boolean {
    return this.authority === sendAuthorityStamp(authority);
  }

  preparation(name: string, value: SendTarget): SendPreparation {
    const target = this.targets.get(name),
      preparation = this.preparations.get(value.peer);
    if (
      !target ||
      target.id !== value.id ||
      target.peer !== value.peer ||
      !preparation
    )
      throw new Error('Pending message differs from its verified send batch.');
    return preparation;
  }
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
