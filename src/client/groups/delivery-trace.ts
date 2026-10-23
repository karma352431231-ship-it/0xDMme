import {
  chatSyncActive,
  traceGroupMessage,
} from '../chat-sync-diagnostics/index.ts';

type SendStep =
  'admitted' | 'staged' | 'sending' | 'accepted' | 'settled' | 'retired';

/** Local opt-in trace of group delivery, recorded only during a capture.
 * Sender: each own text's steps from admission to its verified settlement.
 * Recipient: content hints and the rows of other members shown for the first
 * time in the open group. Message IDs become per-capture numbers; no content,
 * account or group ID leaves this module. Tabs and devices are not
 * correlated: a recipient's report measures hint to row on its own clock. */
export class GroupDeliveryTrace {
  private group: string | null = null;
  private readonly shown = new Set<string>();
  step(reason: SendStep, id: string): void {
    traceGroupMessage(this, { event: 'group-send', reason }, id);
  }
  hint(): void {
    traceGroupMessage(this, { event: 'group-receive', reason: 'live-hint' });
  }
  /** The open group's verified rows were drawn. The first drawing of a group,
   * the first one during a capture, or one past the bound only sets what was
   * already shown. */
  rendered(
    groupId: string | null,
    views: readonly { id: string; own: boolean }[],
  ): void {
    if (!chatSyncActive()) {
      this.group = null;
      this.shown.clear();
      return;
    }
    const baseline = groupId !== this.group || this.shown.size > 512;
    if (baseline) this.shown.clear();
    this.group = groupId;
    let rows = 0;
    for (const view of views) {
      if (view.own || this.shown.has(view.id)) continue;
      this.shown.add(view.id);
      rows++;
    }
    if (rows && !baseline)
      traceGroupMessage(this, {
        event: 'group-receive',
        reason: 'presented',
        rows,
      });
  }
}
