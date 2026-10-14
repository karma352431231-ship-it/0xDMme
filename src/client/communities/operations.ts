interface OperationHooks {
  generation: () => number;
  changed: (busy: boolean, background: boolean) => void;
  failed: (error: unknown) => void;
  settled: (generation: number) => void;
}
interface ActiveOperation {
  background: boolean;
  done: Promise<void>;
}

/** One operation and at most one user action waiting behind an automatic read.
 * Navigation/session changes discard the waiting action before it can write. */
export class CommunityOperations {
  private readonly hooks: OperationHooks;
  private active: ActiveOperation | null = null;
  private waiting = false;
  constructor(hooks: OperationHooks) {
    this.hooks = hooks;
  }
  async run(
    work: () => Promise<void>,
    options: { background?: boolean } = {},
  ): Promise<void> {
    if (this.waiting) return;
    const background = options.background === true;
    const generation = this.hooks.generation();
    if (this.active) {
      if (background || !this.active.background) return;
      this.waiting = true;
      this.hooks.changed(true, false);
      await this.active.done;
      this.waiting = false;
      if (generation !== this.hooks.generation()) {
        this.hooks.changed(false, false);
        this.hooks.settled(generation);
        return;
      }
    }
    let finish = () => {};
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.active = { background, done };
    this.hooks.changed(true, background);
    try {
      await work();
    } catch (error: unknown) {
      if (generation === this.hooks.generation()) this.hooks.failed(error);
    } finally {
      this.active = null;
      this.hooks.changed(this.waiting, this.waiting ? false : background);
      finish();
      this.hooks.settled(generation);
    }
  }
}
