import type { SigningAuthority } from '../vault-authority/index.ts';

/** The device state the last exclusive turn verified: its directory hash and
 * event count, with a signer bound to this session. */
export interface VerifiedSigner extends SigningAuthority {
  events: number;
  /** The session this state belongs to is still the current one. */
  current: () => boolean;
}
/** The server's directory position after a given event count. */
export interface DirectoryPosition {
  events: number;
  revision: number;
  head: unknown;
}

const concurrent = 4;
const waitingLimit = 64;

/** Work that only signs requests — no vault keys, secret opening, SDK or local
 * storage — runs outside the exclusive account turn. Each operation still
 * reads the device directory from the server first and proceeds only if it
 * equals the state the last exclusive turn verified, with no new events;
 * otherwise, or before any verified state exists, it runs in an exclusive
 * turn, which verifies and stores the new directory. The server also checks
 * the session, the signed directory and this device on every request. */
export class SigningLane {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly options: {
    verified: () => VerifiedSigner | null;
    position: (
      signer: VerifiedSigner,
      after: number,
    ) => Promise<DirectoryPosition>;
    exclusive: <T>(
      work: (authority: SigningAuthority) => Promise<T>,
    ) => Promise<T>;
  };
  constructor(options: SigningLane['options']) {
    this.options = options;
  }
  async run<T>(work: (authority: SigningAuthority) => Promise<T>): Promise<T> {
    await this.admit();
    try {
      const signer = await this.fresh();
      if (signer)
        return await work({
          session: signer.session,
          directory: signer.directory,
          sign: signer.sign,
        });
    } finally {
      this.release();
    }
    // The exclusive turn has its own queue; this lane's slot is already free.
    return this.options.exclusive(work);
  }
  /** The verified signer when the server still reports exactly its directory. */
  private async fresh(): Promise<VerifiedSigner | null> {
    const signer = this.options.verified();
    if (!signer) return null;
    const position = await this.options.position(signer, signer.events);
    if (!signer.current()) throw new Error('Session changed.');
    return position.events === 0 &&
      position.revision === signer.events &&
      position.head === signer.directory
      ? signer
      : null;
  }
  private admit(): Promise<void> {
    if (this.active < concurrent) {
      this.active++;
      return Promise.resolve();
    }
    if (this.waiting.length >= waitingLimit)
      return Promise.reject(
        new Error('Wait for conversations to update, then try again.'),
      );
    return new Promise((resolve) => this.waiting.push(resolve));
  }
  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }
}
