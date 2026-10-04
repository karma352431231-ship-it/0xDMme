import { object, uuid } from '../../shared/account/index.ts';
import type { VaultSync, VaultEntry } from '../vault-sync/index.ts';
const entity = '32250d1a-cc8f-48bb-8f23-5fd90629606e';
const label = 'Privacidade dos próximos status';
export class StatusPreferences {
  private readonly sync: VaultSync;
  excluded = new Set<string>();
  conflict = false;
  constructor(sync: VaultSync) {
    this.sync = sync;
  }
  clear(): void {
    this.excluded.clear();
    this.conflict = false;
  }
  private entries(): VaultEntry[] {
    return [...this.sync.currentHeads().values()]
      .flat()
      .filter(
        (e) =>
          e.change.entity === entity &&
          e.change.kind === 'settings' &&
          e.change.label === label &&
          !this.sync.isRemoved(e.commit.id),
      );
  }
  async load(): Promise<void> {
    this.clear();
    const entries = this.entries();
    this.conflict = entries.length > 1;
    for (const entry of entries) {
      const value = object(
        JSON.parse(await this.sync.open(entry.commit.id)) as unknown,
      );
      if (value['version'] !== 1 || !Array.isArray(value['excluded']))
        throw new Error('Preferência de status inválida.');
      for (const account of value['excluded']) this.excluded.add(uuid(account));
    }
  }
  async save(excluded: ReadonlySet<string>): Promise<void> {
    await this.sync.refresh();
    if (!this.sync.complete)
      throw new Error('Conclua a sincronização antes de salvar a privacidade.');
    const values = [...excluded].map(uuid).sort();
    await this.sync.save({
      change: {
        version: 1,
        entity,
        kind: 'settings',
        parents: this.entries().map((e) => e.commit.id),
        label,
      },
      value: JSON.stringify({ version: 1, excluded: values }),
    });
    this.excluded = new Set(values);
    this.conflict = false;
  }
}
