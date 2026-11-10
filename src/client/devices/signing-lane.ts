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
// Startup work may arrive before the first exclusive turn verified the
// directory; waiting for it keeps that work off the exclusive turn.
const firstVerificationMs = 8000;

/** Work that only signs requests — no vault keys, secret opening, SDK or local
 * storage — runs outside the exclusive account turn. Each operation still
 * reads the device directory from the server first and proceeds only if it
 * equals the state the last exclusive turn verified, with no new events;
 * otherwise an exclusive turn verifies and stores the new directory before
 * signing work resumes outside it. Work arriving before any verification waits
 * up to eight seconds for the first one, then requests exclusive verification.
 * The server also checks the session, the signed directory and this device
 * on every request. */
export class SigningLane {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private readonly verifying: (() => void)[] = [];
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
      const verified = await this.fresh();
      // A changed directory is verified exclusively. Only public signing
      // capability leaves this callback; no keyring, secret opener or SDK.
      const signer = verified
        ? {
            session: verified.session,
            directory: verified.directory,
            sign: verified.sign,
          }
        : await this.options.exclusive((authority) =>
            Promise.resolve({
              session: authority.session,
              directory: authority.directory,
              sign: authority.sign,
            }),
          );
      return await work(signer);
    } finally {
      this.release();
    }
  }
  /** An exclusive turn verified the directory; release waiting startup work. */
  verifiedChanged(): void {
    for (const resume of this.verifying.splice(0)) resume();
  }
  /** The verified signer when the server still reports exactly its directory. */
  private async fresh(): Promise<VerifiedSigner | null> {
    const signer = this.options.verified() ?? (await this.firstVerified());
    if (!signer) return null;
    const position = await this.options.position(signer, signer.events);
    if (!signer.current()) throw new Error('Session changed.');
    return position.events === 0 &&
      position.revision === signer.events &&
      position.head === signer.directory
      ? signer
      : null;
  }
  private async firstVerified(): Promise<VerifiedSigner | null> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, firstVerificationMs);
      function done(): void {
        clearTimeout(timer);
        resolve();
      }
      this.verifying.push(done);
    });
    return this.options.verified();
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
