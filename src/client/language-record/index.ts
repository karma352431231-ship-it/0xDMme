import { keys, object } from '../../shared/account/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import { isAppLanguage } from '../../shared/i18n/index.ts';
import type { AppLanguage } from '../../shared/i18n/index.ts';
import type { VaultSync, VaultEntry } from '../vault-sync/index.ts';

export type LanguageSync = Pick<
  VaultSync,
  'complete' | 'heads' | 'isRemoved' | 'open' | 'save'
>;
export const languageRecordLabel = '0xdmme:language:v1';

async function entity(accountId: string): Promise<string> {
  const hash = await digest(canonical(['0xdmme-app-language', 1, accountId]));
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Independent encrypted record: older account-settings readers keep their exact schema. */
export class LanguageRecord {
  private readonly sync: LanguageSync;
  constructor(sync: LanguageSync) {
    this.sync = sync;
  }
  private async heads(accountId: string): Promise<VaultEntry[]> {
    if (!this.sync.complete)
      throw new Error('Language preferences are still syncing.');
    const entries = this.sync
      .heads(await entity(accountId))
      .filter(
        (entry) =>
          entry.change.kind === 'settings' &&
          entry.change.label === languageRecordLabel &&
          !this.sync.isRemoved(entry.commit.id),
      )
      .sort((a, b) => b.commit.sequence - a.commit.sequence);
    if (entries.length > 16)
      throw new Error('Too many language preference versions.');
    return entries;
  }
  async load(accountId: string): Promise<AppLanguage | null> {
    const newest = (await this.heads(accountId))[0];
    if (!newest) return null;
    const data = object(
      JSON.parse(await this.sync.open(newest.commit.id)) as unknown,
    );
    keys(data, ['version', 'language']);
    if (data['version'] !== 1 || !isAppLanguage(data['language']))
      throw new Error('Invalid language preference.');
    return data['language'];
  }
  async save(
    accountId: string,
    language: AppLanguage,
    current: () => void,
  ): Promise<void> {
    if (!isAppLanguage(language))
      throw new Error('Invalid language preference.');
    const parents = (await this.heads(accountId)).map(
      (entry) => entry.commit.id,
    );
    const id = await entity(accountId);
    current();
    await this.sync.save({
      change: {
        version: 1,
        entity: id,
        kind: 'settings',
        parents,
        label: languageRecordLabel,
      },
      value: JSON.stringify({ version: 1, language }),
    });
    current();
  }
}
