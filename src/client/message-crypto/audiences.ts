import { canonical } from '../../shared/devices/index.ts';

/** Session-scoped SDK trust and outbound audiences. The SDK identity and exact
 * directory/recovery audience bind every entry. Logout or authority suspension
 * clears them. A newly required key share always takes full verification. */
export class SendAudiences {
  private readonly rooms = new Map<
    string,
    { audience: string; shared: boolean; trusted: boolean }
  >();
  matches(identity: string, room: string, audience: string): boolean {
    const entry = this.rooms.get(canonical([identity, room]));
    return entry?.audience === audience && entry.shared;
  }
  /** Record only after the room key reached every trusted device. */
  remember(identity: string, room: string, audience: string): void {
    const key = canonical([identity, room]);
    this.rooms.delete(key);
    this.rooms.set(key, { audience, shared: true, trusted: true });
    // Bounded: an evicted conversation only rotates on its next send.
    while (this.rooms.size > 1024)
      this.rooms.delete(this.rooms.keys().next().value!);
  }
  trusted(identity: string, room: string, audience: string): boolean {
    const entry = this.rooms.get(canonical([identity, room]));
    return entry?.audience === audience && entry.trusted;
  }
  clear(): void {
    this.rooms.clear();
  }
}

export { SendAudiences as PrivateAudiences };
