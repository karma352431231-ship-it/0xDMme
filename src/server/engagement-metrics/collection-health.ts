export interface CollectionFailureSummary {
  from: string;
  to: string;
  occurrences: number;
}

/** One aggregate buffer, with no request identity or payload; no background task. */
export class CollectionHealth {
  private pending: CollectionFailureSummary | null = null;
  private flushing = false;
  private readonly record:
    ((summary: CollectionFailureSummary) => Promise<void>) | undefined;
  constructor(record?: (summary: CollectionFailureSummary) => Promise<void>) {
    this.record = record;
  }

  failed(): void {
    const now = new Date().toISOString();
    this.pending = this.merge({ from: now, to: now, occurrences: 1 });
  }

  private merge(summary: CollectionFailureSummary): CollectionFailureSummary {
    if (!this.pending) return summary;
    return {
      from: this.pending.from < summary.from ? this.pending.from : summary.from,
      to: this.pending.to > summary.to ? this.pending.to : summary.to,
      occurrences: Math.min(
        Number.MAX_SAFE_INTEGER,
        this.pending.occurrences + summary.occurrences,
      ),
    };
  }

  async flush(): Promise<void> {
    if (!this.record || !this.pending || this.flushing) return;
    const summary = this.pending;
    this.pending = null;
    this.flushing = true;
    try {
      await this.record(summary);
    } catch (error) {
      this.pending = this.merge(summary);
      throw error;
    } finally {
      this.flushing = false;
    }
  }
}
