export type MessageWorkResult = MessageContinuation | void;
export type MessageWork = () => Promise<MessageWorkResult>;

/** A successful bounded turn has more work. This is neither failure nor a retry. */
export class MessageContinuation {
  readonly resume: MessageWork;
  readonly cancel: () => void;
  constructor(resume: MessageWork, cancel: () => void = () => {}) {
    this.resume = resume;
    this.cancel = cancel;
  }
}

/** Defer only the unfinished read and its tail, never replay a send or admission. */
export async function afterMessageWork(
  work: MessageWork,
  settled: () => Promise<void>,
): Promise<MessageWorkResult> {
  const next = await work();
  if (next)
    return new MessageContinuation(
      () => afterMessageWork(next.resume, settled),
      next.cancel,
    );
  await settled();
}

/** One continuation per session. Zero-delay tasks yield to input and saved sends;
 * unavailable owners resume from lifecycle events, without polling. */
export class MessageContinuationQueue {
  private next: MessageContinuation | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly ports: {
    available: () => boolean;
    run: (work: MessageWork) => Promise<void>;
  };
  constructor(ports: MessageContinuationQueue['ports']) {
    this.ports = ports;
  }
  get waiting(): boolean {
    return this.next !== null;
  }
  request(next: MessageContinuation): void {
    this.next?.cancel();
    this.next = next;
    this.resume();
  }
  clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.next?.cancel();
    this.next = null;
  }
  resume(): void {
    if (this.timer !== null || !this.next || !this.ports.available()) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.next || !this.ports.available()) return;
      const next = this.next;
      this.next = null;
      void this.ports.run(next.resume);
    }, 0);
  }
}

/** Requests such as search keep their response open across bounded turns, while
 * the scheduler releases its owner. Cancellation always settles that response. */
export async function awaitMessageWork(
  work: MessageWork,
  schedule: (work: MessageWork) => Promise<boolean>,
): Promise<void> {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const completion = new Promise<void>((succeed, fail) => {
    resolve = succeed;
    reject = fail;
  });
  const cancel = () => reject(new Error('Message synchronization superseded.'));
  const read = async (current: MessageWork): Promise<MessageWorkResult> => {
    try {
      const next = await current();
      if (next)
        return new MessageContinuation(
          () => read(next.resume),
          () => {
            next.cancel();
            cancel();
          },
        );
      resolve();
    } catch (error: unknown) {
      reject(error);
      throw error;
    }
  };
  // Observe completion immediately, including failure during the first turn.
  const scheduled = schedule(() => read(work));
  await Promise.all([
    completion,
    scheduled.then((accepted) => {
      if (!accepted) cancel();
    }),
  ]);
}
