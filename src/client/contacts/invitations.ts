import { digest } from '../../shared/devices/index.ts';
import { invitationLink } from '../../shared/contacts/index.ts';

interface InvitationPorts {
  owner: () => string | null;
  origin: string;
  issue: (hash: string) => Promise<number>;
  revoke: (hash: string) => Promise<void>;
}
/** Tokens exist only after an explicit click and stay in this screen's RAM.
 * Opening/synchronizing the directory never restores a reusable bearer link. */
export class PrivateContactInvitations {
  private readonly ports: InvitationPorts;
  private generation = 0;
  private current: { link: string; hash: string; expiresAt: number } | null =
    null;
  constructor(ports: InvitationPorts) {
    this.ports = ports;
  }
  clear(): void {
    this.generation++;
    this.current = null;
  }
  get link(): string | null {
    return this.current && this.current.expiresAt > Date.now()
      ? this.current.link
      : null;
  }
  async create(): Promise<void> {
    const owner = this.ports.owner(),
      generation = ++this.generation;
    if (!owner) throw new Error('Sign in first.');
    this.current = null;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    bytes.fill(0);
    const hash = await digest(token);
    this.assertCurrent(owner, generation);
    const expiresAt = await this.ports.issue(hash);
    this.assertCurrent(owner, generation);
    this.current = {
      link: invitationLink(this.ports.origin, { owner, token }),
      hash,
      expiresAt,
    };
  }
  async revoke(): Promise<void> {
    const current = this.current,
      generation = this.generation;
    if (!current) return;
    await this.ports.revoke(current.hash);
    if (generation !== this.generation) return;
    this.current = null;
  }
  private assertCurrent(owner: string, generation: number): void {
    if (owner !== this.ports.owner() || generation !== this.generation)
      throw new Error('Session changed.');
  }
}
