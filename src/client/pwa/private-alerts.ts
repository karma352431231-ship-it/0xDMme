import type { PrivateNotificationDetail } from '../notification-private/index.ts';
import { privatePushCandidates } from '../../shared/private-notification/index.ts';
type Candidate = PrivateNotificationDetail['candidate'];
interface DetailRequest {
  candidates: Candidate[];
  scope: string;
  sound: boolean;
}
interface DetailPorts {
  read: (
    input: DetailRequest & { signal: AbortSignal },
  ) => Promise<PrivateNotificationDetail[]>;
  inspect: () => Promise<object | null>;
  show: (
    detail: PrivateNotificationDetail | null,
    sound: boolean,
  ) => Promise<void>;
}
/** One active local read and one replaceable followup. Each request starts its
 * own deadline immediately, including while an older read releases its lock. */
export class PrivateNotificationAlerts {
  private readonly ports: DetailPorts;
  private active: Promise<void> | null = null;
  private pending: PrivateAlert | null = null;
  private current: PrivateAlert | null = null;
  constructor(ports: DetailPorts) {
    this.ports = ports;
  }
  cancel(): void {
    this.pending?.cancel();
    this.pending = null;
    this.current?.cancel();
  }
  request(input: DetailRequest): void {
    this.cancel();
    this.pending = new PrivateAlert(input, this.ports);
    this.active ??= this.drain();
  }
  wait(): Promise<void> {
    return this.active ?? Promise.resolve();
  }
  private async drain(): Promise<void> {
    try {
      while (this.pending) {
        this.current = this.pending;
        this.pending = null;
        // Keep uncooperative SDK/store I/O inside event.waitUntil and never
        // start a second read while it exits. Deadlines can still alert.
        await this.current.run();
      }
    } finally {
      this.current = null;
      this.active = null;
    }
  }
}

/** A private push produces one alert after decryption or a bounded fallback.
 * Both paths recheck current authorization, mute, unread state and session. */
class PrivateAlert {
  private readonly input: DetailRequest;
  private readonly ports: DetailPorts;
  private readonly abort = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  private canceled = false;
  private delivery: Promise<void> | null = null;
  constructor(input: DetailRequest, ports: DetailPorts) {
    this.input = input;
    this.ports = ports;
    this.timer = setTimeout(() => {
      void this.finish([]);
    }, 8000);
  }
  cancel(): void {
    this.canceled = true;
    clearTimeout(this.timer);
    this.abort.abort();
  }
  async run(): Promise<void> {
    if (this.canceled) return;
    if (this.delivery) return this.delivery;
    let details: PrivateNotificationDetail[] = [];
    try {
      details = await this.ports.read({
        ...this.input,
        signal: this.abort.signal,
      });
    } catch {
      // Missing local keys/storage produce a generic alert only after a fresh
      // server check. A canceled request never produces even that fallback.
    }
    await this.finish(details);
  }
  private finish(details: PrivateNotificationDetail[]): Promise<void> {
    this.delivery ??= this.deliver(details);
    return this.delivery;
  }
  private async deliver(details: PrivateNotificationDetail[]): Promise<void> {
    clearTimeout(this.timer);
    this.abort.abort();
    if (this.canceled) return;
    try {
      const current = await this.ports.inspect();
      if (
        this.canceled ||
        !current ||
        !('publicScope' in current) ||
        current.publicScope !== this.input.scope ||
        !('privateCandidates' in current)
      )
        return;
      const eligible = this.eligible(current.privateCandidates);
      if (!eligible.length) return;
      const detail = details.find((value) =>
        eligible.some((candidate) => sameCandidate(candidate, value.candidate)),
      );
      await this.ports.show(detail ?? null, this.input.sound);
    } catch {
      // Unverified authority/mute never alerts. Cleartext never enters caches,
      // logs or a request; a late result cannot replace the single OS alert.
    }
  }
  private eligible(value: unknown): Candidate[] {
    const current = privatePushCandidates(value);
    return this.input.candidates.filter((candidate) =>
      current.some((other) => sameCandidate(candidate, other)),
    );
  }
}
function sameCandidate(a: Candidate, b: Candidate): boolean {
  if (a.kind !== b.kind || a.id !== b.id) return false;
  return a.kind === 'direct'
    ? b.kind === 'direct' && a.peer === b.peer
    : b.kind === 'group' && a.group === b.group;
}
