import { MessageWarmup } from './warmup.ts';

interface VisitPorts<T> {
  connected: () => boolean;
  available: () => boolean;
  backgroundReady: () => boolean;
  reusable: (peer: T) => boolean;
  select: (peer: T) => void;
  restore: () => boolean;
  background: (step: () => Promise<void>) => Promise<void>;
  check: () => Promise<void>;
  failed: () => void;
}

/** Memory-only navigation is immediate. Its coalesced check yields to normal
 * foreground work and never marks an unseen conversation as read. */
export class ConnectedConversationVisits<T> {
  private readonly ports: VisitPorts<T>;
  private readonly checks: MessageWarmup;
  constructor(ports: VisitPorts<T>) {
    this.ports = ports;
    this.checks = new MessageWarmup({
      available: ports.backgroundReady,
      run: ports.background,
      changed: () => this.resume(),
      failed: ports.failed,
      steps: [
        async () => {
          try {
            await ports.check();
          } catch (error: unknown) {
            ports.failed();
            throw error;
          }
        },
      ],
    });
  }
  open(peer: T): boolean {
    if (
      !this.ports.connected() ||
      !this.ports.available() ||
      !this.ports.reusable(peer)
    )
      return false;
    this.ports.select(peer);
    return this.restore();
  }
  restore(): boolean {
    if (!this.ports.connected() || !this.ports.restore()) return false;
    this.checks.queue();
    return true;
  }
  resume(): void {
    this.checks.resume();
  }
  reset(): void {
    this.checks.reset();
  }
}
