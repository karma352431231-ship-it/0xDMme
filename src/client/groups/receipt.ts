/** What a group change hint asks for: new content, delivery/read metadata,
 * or a general wakeup that may involve membership, governance or profiles. */
export type GroupChange = 'content' | 'receipts' | 'all';

export interface GroupMetadataSchedule {
  shouldYield: () => boolean;
  pending: () => void;
}
export interface GroupMetadataPolicy {
  shouldYield: () => boolean;
  deferred: (groupId: string) => void;
}
type MetadataKind = 'reads' | 'receipts';

interface GroupReceiptPorts {
  /** The open, visible, verified group; null when none is shown. */
  visibleGroup: () => string | null;
  /** Re-read the open group's current window after verifying that group. */
  readSelected: (groupId: string) => Promise<void>;
  /** Delivery/read metadata of the open group, without decoding history. */
  receipts: () => Promise<void>;
  /** Deferred read acknowledgements and checks, after verified content. */
  reads: () => Promise<void>;
  /** Unread counts and alerts for every listed group. */
  states: () => Promise<void>;
  /** The full group list, governance and profile refresh. */
  directory: () => Promise<void>;
  changed: () => void;
  schedule?: GroupMetadataSchedule | undefined;
}

/** Group content and receipt updates never refresh the group list, read
 * other groups' profiles or publish a profile; only a general wakeup does.
 * Unrelated groups keep their background preparation and counters. */
export class GroupReceipt {
  private readonly ports: GroupReceiptPorts;
  private pending: { group: string; kind: MetadataKind } | null = null;
  private generation = 0;
  readonly metadata: GroupMetadataPolicy;
  readonly receiptMetadata: GroupMetadataPolicy;
  constructor(ports: GroupReceiptPorts) {
    this.ports = ports;
    this.metadata = this.policy('reads');
    this.receiptMetadata = this.policy('receipts');
  }
  reset(): void {
    this.generation++;
    this.pending = null;
  }
  private policy(kind: MetadataKind): GroupMetadataPolicy {
    return {
      shouldYield: () => this.ports.schedule?.shouldYield() ?? false,
      deferred: (group) => {
        if (this.ports.visibleGroup() === group)
          this.pending = {
            group,
            kind:
              this.pending?.group === group && this.pending.kind === 'reads'
                ? 'reads'
                : kind,
          };
        this.ports.schedule?.pending();
      },
    };
  }
  async changed(change: GroupChange): Promise<void> {
    if (change === 'all') return this.ports.directory();
    const current = this.generation;
    const group = this.ports.visibleGroup();
    if (group && change === 'content') await this.ports.readSelected(group);
    else if (group) {
      if (this.receiptMetadata.shouldYield())
        this.receiptMetadata.deferred(group);
      else await this.ports.receipts();
    }
    if (current !== this.generation) return;
    await this.counters();
  }
  /** The existing metadata continuation drains one coalesced selected demand. */
  async counters(): Promise<void> {
    const current = this.generation;
    if (this.yield()) return;
    await this.settleSelected();
    if (current !== this.generation || this.yield()) return;
    await this.ports.states();
    if (current === this.generation) this.ports.changed();
  }
  private yield(): boolean {
    if (!this.metadata.shouldYield()) return false;
    this.ports.schedule?.pending();
    return true;
  }
  private async settleSelected(): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    if (this.ports.visibleGroup() === pending.group)
      await this.ports[pending.kind]();
    if (this.pending === pending) this.pending = null;
  }
}
