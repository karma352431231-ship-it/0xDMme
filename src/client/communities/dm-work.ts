/** One running operation and bounded pending foreground work. Navigation
 * replaces older waiters while letting the current IO release its authority. */
export class DmWork {
  private active: Promise<void> | null = null;
  private generation = 0;
  private waiting = false;
  get busy(): boolean {
    return this.active !== null;
  }
  reset(): void {
    this.generation++;
    this.waiting = false;
  }
  async run(work: () => Promise<void>): Promise<void> {
    const generation = this.generation;
    if (this.waiting) return;
    this.waiting = true;
    await this.active;
    if (generation !== this.generation) return;
    this.waiting = false;
    let release: () => void = () => {};
    this.active = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await work();
    } finally {
      this.active = null;
      release();
    }
  }
}
