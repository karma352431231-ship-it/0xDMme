import { keys, object, uuid } from '../../shared/account/index.ts';
import { walletContact } from '../../shared/contacts/index.ts';
import type { WalletContact } from '../../shared/contacts/index.ts';

export interface MemberWallet extends WalletContact {
  accountId: string;
}
export function memberWalletPage(value: unknown): MemberWallet[] {
  const data = object(value);
  keys(data, ['items']);
  const items = data['items'];
  if (!Array.isArray(items) || items.length > 16)
    throw new Error('Invalid member wallets.');
  return items.map((input: unknown) => {
    const row = object(input);
    keys(row, ['accountId', 'ecosystem', 'address']);
    return {
      accountId: uuid(row['accountId']),
      ...walletContact({
        ecosystem: row['ecosystem'],
        address: row['address'],
      }),
    };
  });
}
type Read = (groupId: string, accounts: string[]) => Promise<MemberWallet[]>;
/** Wallets of co-members in the open group who accept requests by wallet
 * (owner decision 23/10/2026). The server decides eligibility; this cache only
 * avoids asking twice. `null` means the member accepts invitations only (or a
 * block hides them); a failed read stays unknown until a member is tapped. */
export class GroupMemberWallets {
  private readonly read: Read;
  private group: string | null = null;
  private epoch = 0;
  private readonly known = new Map<string, MemberWallet | null>();
  private readonly pending = new Set<string>();
  private readonly failed = new Set<string>();
  constructor(read: Read) {
    this.read = read;
  }
  clear(): void {
    this.epoch++;
    this.group = null;
    this.known.clear();
    this.pending.clear();
    this.failed.clear();
  }
  /** `undefined` while not read yet. */
  get(account: string): MemberWallet | null | undefined {
    return this.known.get(account);
  }
  /** Reads members not seen yet, 16 per request; true when anything arrived. */
  async load(groupId: string, accounts: readonly string[]): Promise<boolean> {
    if (this.group !== groupId) {
      this.clear();
      this.group = groupId;
    }
    const epoch = this.epoch,
      missing = this.missing(accounts);
    let changed = false;
    for (let offset = 0; offset < missing.length; offset += 16) {
      const read = await this.readBatch(
        groupId,
        missing.slice(offset, offset + 16),
        epoch,
      );
      if (read === null) return false;
      changed ||= read;
    }
    return changed;
  }
  private missing(accounts: readonly string[]): string[] {
    return [...new Set(accounts)].filter(
      (account) =>
        !this.known.has(account) &&
        !this.pending.has(account) &&
        !this.failed.has(account),
    );
  }
  /** One request; `null` when a group or session change made it obsolete. */
  private async readBatch(
    groupId: string,
    batch: string[],
    epoch: number,
  ): Promise<boolean | null> {
    for (const account of batch) this.pending.add(account);
    // A failed read stays unknown and private: no wallet is shown, and a tap
    // retries once before deciding.
    const found = await this.read(groupId, batch).then(
      (rows) => new Map(rows.map((row) => [row.accountId, row])),
      () => null,
    );
    if (epoch !== this.epoch) return null;
    for (const account of batch) {
      this.pending.delete(account);
      if (found) this.known.set(account, found.get(account) ?? null);
      else this.failed.add(account);
    }
    return found !== null;
  }
  /** A tap on a member retries a failed read before deciding. */
  async contact(
    groupId: string,
    account: string,
  ): Promise<MemberWallet | null | undefined> {
    this.failed.delete(account);
    await this.load(groupId, [account]);
    return this.get(account);
  }
}
