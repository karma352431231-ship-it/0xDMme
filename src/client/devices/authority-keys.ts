import { aesKey } from '../device-keys/index.ts';

/** Imports each epoch once per verified authority turn; never shared across turns. */
export class AuthorityKeys {
  private readonly values = new Map<number, Promise<CryptoKey>>();
  private readonly read: (epoch: number) => string;
  private readonly guard: () => void;
  private disposed = false;
  constructor(read: (epoch: number) => string, guard: () => void) {
    this.read = read;
    this.guard = guard;
  }
  async key(epoch: number): Promise<CryptoKey> {
    this.check();
    let pending = this.values.get(epoch);
    if (!pending) {
      const secret = this.read(epoch);
      pending = aesKey(secret);
      this.values.set(epoch, pending);
      if (this.values.size > 32)
        this.values.delete(this.values.keys().next().value!);
    }
    const key = await pending;
    this.check();
    return key;
  }
  dispose(): void {
    this.disposed = true;
    this.values.clear();
  }
  private check(): void {
    this.guard();
    if (this.disposed) throw new Error('Authority turn ended.');
  }
}
