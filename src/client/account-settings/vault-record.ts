import { canonical, digest } from '../../shared/devices/index.ts';
import type { VaultEntry, VaultSync } from '../vault-sync/index.ts';
import { accountSettings } from './record.ts';
import type { AccountSettings } from './record.ts';

export type SettingsSync = Pick<
  VaultSync,
  'complete' | 'refresh' | 'heads' | 'isRemoved' | 'open' | 'save'
>;
// Each refresh reads up to eight pages; this bounds a first load of a long vault.
const refreshRounds = 6;
// Other `settings` records (conversations, calls, status) have their own
// entity and label; each reader filters by both.
const label = 'Configurações da conta';

/** Fixed per account, so every device finds the same record. */
async function settingsEntity(accountId: string): Promise<string> {
  const hash = await digest(
    canonical(['0xdmme-account-settings', 1, accountId]),
  );
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** The account's settings as one versioned record in the encrypted vault. */
export class SettingsRecord {
  private readonly sync: SettingsSync;
  constructor(sync: SettingsSync) {
    this.sync = sync;
  }
  private async heads(accountId: string): Promise<VaultEntry[]> {
    const heads = this.sync
      .heads(await settingsEntity(accountId))
      .filter(
        (entry) =>
          entry.change.kind === 'settings' &&
          entry.change.label === label &&
          !this.sync.isRemoved(entry.commit.id),
      )
      .sort((a, b) => b.commit.sequence - a.commit.sequence);
    if (heads.length > 16)
      throw new Error('Configurações da conta com versões demais no cofre.');
    return heads;
  }
  /** `null` when the account never confirmed Configurações iniciais. */
  async load(accountId: string): Promise<AccountSettings | null> {
    // `complete` describes the local checkpoint, which can be empty while
    // another reader is still pulling the account's records from the server.
    // Always synchronize before deciding that the initial setup is missing.
    for (let round = 0; round < refreshRounds; round++) {
      await this.sync.refresh();
      if (this.sync.complete) break;
    }
    if (!this.sync.complete)
      throw new Error('O cofre ainda está carregando as configurações.');
    const newest = (await this.heads(accountId))[0];
    if (!newest) return null;
    // Opening failures propagate. Content that does not validate is offered
    // again in Configurações iniciais and superseded by the next save.
    const raw = await this.sync.open(newest.commit.id);
    try {
      return accountSettings(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }
  /** Supersedes every current version, so concurrent devices converge. */
  async save(accountId: string, value: AccountSettings): Promise<void> {
    const parents = (await this.heads(accountId)).map(
      (entry) => entry.commit.id,
    );
    await this.sync.save({
      change: {
        version: 1,
        entity: await settingsEntity(accountId),
        kind: 'settings',
        parents,
        label,
      },
      value: JSON.stringify(accountSettings(value)),
    });
  }
}
