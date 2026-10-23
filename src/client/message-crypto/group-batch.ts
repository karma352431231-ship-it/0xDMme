/** Device trust prepared once for a bounded group send batch. A message in the
 * same batch, for the same group period, members, participant directories,
 * recovery keys and sender authority, reuses the Matrix device query of the
 * message before it; anything else, a 17th message or a batch older than ten
 * seconds queries again. The object lives for one batch only, so nothing is
 * reused across batches. The server still checks members, directories,
 * recovery and key destinations when each message is published. */
export class GroupSendBatch {
  private trusted: string | null = null;
  private uses = 0;
  private readonly started: number;
  private readonly now: () => number;
  constructor(now: () => number = () => performance.now()) {
    this.now = now;
    this.started = now();
  }
  covers(key: string): boolean {
    return (
      this.trusted === key &&
      this.uses < 16 &&
      this.now() - this.started < 10_000
    );
  }
  /** A message used trust for `key`, freshly queried or reused. */
  used(key: string, fresh: boolean): void {
    if (fresh) {
      this.trusted = key;
      this.uses = 0;
    }
    this.uses++;
  }
  /** A rejection showed the prepared trust may be stale. */
  reset(): void {
    this.trusted = null;
    this.uses = 0;
  }
}
