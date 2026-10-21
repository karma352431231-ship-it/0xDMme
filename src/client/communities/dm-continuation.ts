/** A continuation yields to input without adding a fixed per-page delay.
 * One timer per owner; real failures never enter this queue automatically. */
export class DmContinuations {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending = false;
  private readonly ports: { available: () => boolean; run: () => void };
  constructor(ports: { available: () => boolean; run: () => void }) {
    this.ports = ports;
  }
  request(): void {
    this.pending = true;
    this.resume();
  }
  resume(): void {
    if (this.timer !== null || !this.pending || !this.ports.available()) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.ports.available()) return;
      this.pending = false;
      this.ports.run();
    }, 0);
  }
  clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = false;
  }
}
