import { object, uuid } from '../../shared/account/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { groupEvent } from '../../shared/groups/index.ts';
import type { GroupEvent } from '../../shared/groups/index.ts';
import {
  localGet,
  localPut,
  localPage,
  localDelete,
  sealLocal,
  openLocal,
} from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { groupTitle } from './cache.ts';
export interface CatalogGroup {
  state: GroupEvent;
  title: string;
  profileSequence?: number;
}
export class GroupCatalog {
  private readonly authority: VaultAuthority;
  private readonly scope: string;
  constructor(authority: VaultAuthority) {
    this.authority = authority;
    this.scope = `${authority.session.accountId}:groups`;
  }
  private async put(name: string, value: unknown): Promise<void> {
    const row = await sealLocal(
      this.authority,
      crypto.randomUUID(),
      JSON.stringify({ scope: this.scope, name, value }),
    );
    await localPut(this.scope, name, row, row.bytes.length + 512);
  }
  private async open(name: string, row: LocalCipher): Promise<unknown> {
    const data = object(
      JSON.parse(await openLocal(this.authority, row)) as unknown,
    );
    if (data['scope'] !== this.scope || data['name'] !== name)
      throw new Error('Catálogo local de outra conta.');
    return data['value'];
  }
  async save(group: CatalogGroup): Promise<void> {
    const name = `group:${group.state.groupId}`,
      old = await localGet<LocalCipher>(this.scope, name);
    if (old) {
      const data = object(await this.open(name, old)),
        state = groupEvent(data['state']);
      if (state.revision > group.state.revision) return;
      if (
        state.revision === group.state.revision &&
        integer(data['profileSequence'] ?? 0, Number.MAX_SAFE_INTEGER) >
          (group.profileSequence ?? 0)
      )
        return;
    }
    await this.put(name, {
      ...group,
      profileSequence: group.profileSequence ?? 0,
    });
  }
  async page(
    after: string | null,
  ): Promise<{ items: CatalogGroup[]; next: string | null }> {
    const page = await localPage<LocalCipher>(this.scope, 'group:', after),
      items: CatalogGroup[] = [];
    for (const row of page.items) {
      const data = object(await this.open(row.name, row.value)),
        state = groupEvent(data['state']);
      if (row.name !== `group:${state.groupId}`)
        throw new Error('Índice local de outro grupo.');
      items.push({
        state,
        title: groupTitle({ version: 1, title: data['title'] }),
        profileSequence: integer(
          data['profileSequence'] ?? 0,
          Number.MAX_SAFE_INTEGER,
        ),
      });
    }
    return { items, next: page.next };
  }
  async creation(): Promise<{ event: GroupEvent; title: string } | null> {
    const row = await localGet<LocalCipher>(this.scope, 'creation');
    if (!row) return null;
    const data = object(await this.open('creation', row)),
      event = groupEvent(data['event']);
    if (
      event.kind !== 'create' ||
      event.actor !== this.authority.session.accountId
    )
      throw new Error('Criação local inválida.');
    return { event, title: groupTitle({ version: 1, title: data['title'] }) };
  }
  saveCreation(event: GroupEvent, title: string): Promise<void> {
    return this.put('creation', { event, title });
  }
  clearCreation(): Promise<void> {
    return localDelete(this.scope, 'creation');
  }
  remove(id: string): Promise<void> {
    return localDelete(this.scope, `group:${uuid(id)}`);
  }
}
