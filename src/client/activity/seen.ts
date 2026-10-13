type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
const maximumSeen = 512;
/** The bell remembers arrival IDs, independently of opening/gray state. */
export class ActivitySeen {
  private account: string | null = null;
  private ids = new Set<string>();
  private readonly storage: StoragePort | null;
  constructor(
    storage: StoragePort | null = typeof localStorage === 'undefined'
      ? null
      : localStorage,
  ) {
    this.storage = storage;
  }
  setAccount(account: string | null): void {
    if (account === this.account) return;
    this.account = account;
    this.ids.clear();
    if (!account) return;
    try {
      const value: unknown = JSON.parse(
        this.storage?.getItem(this.key()) ?? '[]',
      );
      if (
        Array.isArray(value) &&
        value.length <= maximumSeen &&
        value.every((item) => typeof item === 'string' && item.length <= 160)
      )
        this.ids = new Set(value as string[]);
    } catch {
      /* Unavailable storage retains the in-memory state of this visit. */
    }
  }
  setSession(session: { accountId: string } | null): void {
    this.setAccount(session?.accountId ?? null);
  }
  private key(): string {
    return `0xdmme:activity-seen:${this.account}`;
  }
  count(ids: readonly string[]): number {
    return ids.filter((id) => !this.ids.has(id)).length;
  }
  view(ids: readonly string[]): void {
    if (!this.account || !ids.length) return;
    const next = [...new Set([...this.ids, ...ids])].slice(-maximumSeen);
    if (next.length === this.ids.size && next.every((id) => this.ids.has(id)))
      return;
    this.ids = new Set(next);
    try {
      this.storage?.setItem(this.key(), JSON.stringify(next));
    } catch {
      /* Seeing the inbox never claims that an individual item was opened. */
    }
  }
}
