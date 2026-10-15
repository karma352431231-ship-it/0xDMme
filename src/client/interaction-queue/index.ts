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
export class InteractionQueue {
  private readonly hooks: OperationHooks;
  private active: ActiveOperation | null = null;
  private waiting = false;
  private waitingQuiet = false;
  constructor(hooks: OperationHooks) {
    this.hooks = hooks;
  }
  async run(
    work: () => Promise<void>,
    options: { background?: boolean; quiet?: boolean } = {},
  ): Promise<void> {
    if (this.waiting) return;
    const background = options.background === true;
    const generation = this.hooks.generation();
    if (this.active) {
      if (background || !this.active.background) return;
      this.waiting = true;
      this.waitingQuiet = options.quiet === true;
      this.hooks.changed(true, this.waitingQuiet);
      await this.active.done;
      this.waiting = false;
      this.waitingQuiet = false;
      if (generation !== this.hooks.generation()) {
        this.hooks.changed(false, false);
        this.hooks.settled(generation);
        return;
      }
    }
    return this.execute(work, {
      generation,
      background,
      quiet: background || options.quiet === true,
    });
  }
  private async execute(
    work: () => Promise<void>,
    context: { generation: number; background: boolean; quiet: boolean },
  ): Promise<void> {
    let finish = () => {};
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.active = { background: context.background, done };
    this.hooks.changed(true, context.quiet);
    try {
      await work();
    } catch (error: unknown) {
      if (context.generation === this.hooks.generation())
        this.hooks.failed(error);
    } finally {
      this.active = null;
      this.hooks.changed(
        this.waiting,
        this.waiting ? this.waitingQuiet : context.quiet,
      );
      finish();
      this.hooks.settled(context.generation);
    }
  }
}
