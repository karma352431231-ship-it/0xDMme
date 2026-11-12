import type { DailyRow, DailyView } from '../daily-text/index.ts';

/**
 * Pins and unpins chosen on this device show at once, before the change is
 * sent and read back (12/11/2026). A pending choice wins over what the history
 * says until the history reports the same end, then it is dropped.
 */
export class PendingPins {
  private readonly pending = new Map<string, number>();
  clear(): void {
    this.pending.clear();
  }
  apply<T extends DailyRow>(views: DailyView<T>[]): DailyView<T>[] {
    if (!this.pending.size) return views;
    return views.map((view) => {
      const until = this.pending.get(view.id);
      if (until === undefined) return view;
      if ((view.pin?.until ?? 0) === until) {
        this.pending.delete(view.id);
        return view;
      }
      return {
        ...view,
        pin: { until, sequence: Number.MAX_SAFE_INTEGER, own: true },
      };
    });
  }
  /** Shows the choice, waits for it to be stored, and undoes it on failure. */
  async run(input: {
    id: string;
    until: number;
    store: () => Promise<void>;
    repaint: () => void;
  }): Promise<void> {
    this.pending.set(input.id, input.until);
    input.repaint();
    try {
      await input.store();
    } catch (error: unknown) {
      this.pending.delete(input.id);
      input.repaint();
      throw error;
    }
  }
}
