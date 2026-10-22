import { canonical } from '../../shared/devices/index.ts';

/** Private rooms whose current outbound session was shared with an audience in
 * this signed-in session (owner-approved F8, option A). Memory only: a reload,
 * logout, authority suspension or reset starts empty, so the next send rotates
 * once. Entries are bound to the SDK identity key, so another store or a reset
 * identity never reuses them. An audience is both directory hashes; any device
 * added, revoked or reset on either side changes it and forces rotation. */
export class PrivateAudiences {
  private readonly rooms = new Map<string, string>();
  matches(identity: string, room: string, audience: string): boolean {
    return this.rooms.get(canonical([identity, room])) === audience;
  }
  /** Record only after the room key reached every trusted device. */
  remember(identity: string, room: string, audience: string): void {
    const key = canonical([identity, room]);
    this.rooms.delete(key);
    this.rooms.set(key, audience);
    // Bounded: an evicted conversation only rotates on its next send.
    while (this.rooms.size > 1024)
      this.rooms.delete(this.rooms.keys().next().value!);
  }
  clear(): void {
    this.rooms.clear();
  }
}
