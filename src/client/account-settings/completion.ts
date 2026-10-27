const storageKey = '0xdmme:settings-completed:v1';
const maximumAccounts = 64;
const maximumBytes = 4096;
const accountPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
type CompletionStorage = Pick<Storage, 'getItem' | 'setItem'>;

function deviceStorage(): CompletionStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function completedAccounts(value: string | null): string[] {
  if (!value || value.length > maximumBytes) return [];
  try {
    const accounts: unknown = JSON.parse(value);
    if (!Array.isArray(accounts) || accounts.length > maximumAccounts)
      return [];
    return accounts.filter(
      (account): account is string =>
        typeof account === 'string' && accountPattern.test(account),
    );
  } catch {
    return [];
  }
}

/** A bounded device-only UI marker. It grants no account or device capability. */
export class SettingsCompletion {
  private readonly storage: CompletionStorage | null;
  constructor(storage: CompletionStorage | null = deviceStorage()) {
    this.storage = storage;
  }
  private read(): string[] {
    try {
      return completedAccounts(this.storage?.getItem(storageKey) ?? null);
    } catch {
      // Unknown device state must not suppress first-time setup.
      return [];
    }
  }
  has(account: string): boolean {
    return this.read().includes(account);
  }
  remember(account: string): void {
    if (!accountPattern.test(account)) return;
    const accounts = this.read();
    if (accounts.includes(account)) return;
    try {
      this.storage?.setItem(
        storageKey,
        JSON.stringify([...accounts, account].slice(-maximumAccounts)),
      );
    } catch {
      // Account settings remain durable; setup can recur if device storage fails.
    }
  }
}
