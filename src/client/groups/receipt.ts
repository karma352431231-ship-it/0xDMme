/** What a group change hint asks for: new content, delivery/read metadata,
 * or a general wakeup that may involve membership, governance or profiles. */
export type GroupChange = 'content' | 'receipts' | 'all';

interface GroupReceiptPorts {
  /** The open, visible, verified group; null when none is shown. */
  visibleGroup: () => string | null;
  /** Re-read the open group's current window after verifying that group. */
  readSelected: (groupId: string) => Promise<void>;
  /** Delivery/read metadata of the open group, without decoding history. */
  receipts: () => Promise<void>;
  /** Unread counts and alerts for every listed group. */
  states: () => Promise<void>;
  /** The full group list, governance and profile refresh. */
  directory: () => Promise<void>;
  changed: () => void;
}

/** Group content and receipt updates never refresh the group list, read
 * other groups' profiles or publish a profile; only a general wakeup does.
 * Unrelated groups keep their background preparation and counters. */
export class GroupReceipt {
  private readonly ports: GroupReceiptPorts;
  constructor(ports: GroupReceiptPorts) {
    this.ports = ports;
  }
  async changed(change: GroupChange): Promise<void> {
    if (change === 'all') return this.ports.directory();
    const group = this.ports.visibleGroup();
    if (group && change === 'content') await this.ports.readSelected(group);
    else if (group) await this.ports.receipts();
    await this.counters();
  }
  /** After a background group page: counters only. */
  async counters(): Promise<void> {
    await this.ports.states();
    this.ports.changed();
  }
}
