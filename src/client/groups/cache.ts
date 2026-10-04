import { object } from '../../shared/account/index.ts';
import { groupEvent } from '../../shared/groups/index.ts';
import type { GroupEvent } from '../../shared/groups/index.ts';
import { groupEventHash } from '../../shared/groups/index.ts';
import {
  localGet,
  localPutWithin,
  openLocal,
  sealLocal,
  localPage,
  localPrevious,
  localDelete,
} from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
export { groupTitle } from '../../shared/group-messages/index.ts';
export function groupCacheScope(account: string, group: string): string {
  return `${account}:group:${group}`;
}
export class GroupCache {
  private readonly authority: VaultAuthority;
  private readonly scope: string;
  constructor(authority: VaultAuthority, group: string) {
    this.authority = authority;
    this.scope = groupCacheScope(authority.session.accountId, group);
  }
  async get(name: string): Promise<unknown> {
    const row = await localGet<LocalCipher>(this.scope, name);
    return row ? this.open(name, row) : null;
  }
  async put(name: string, value: unknown): Promise<void> {
    const row = await sealLocal(
      this.authority,
      crypto.randomUUID(),
      JSON.stringify({ scope: this.scope, name, value }),
    );
    await localPutWithin({
      scope: this.scope,
      name,
      value: row,
      size: row.bytes.length + 512,
      maximum: 1_000_000_000,
    });
  }
  private async open(name: string, row: LocalCipher): Promise<unknown> {
    const data = object(
      JSON.parse(await openLocal(this.authority, row)) as unknown,
    );
    if (data['scope'] !== this.scope || data['name'] !== name)
      throw new Error('Cache de outro grupo ou registro.');
    return data['value'];
  }
  async current(): Promise<GroupEvent | null> {
    const raw = await this.get('governance-current');
    return raw === null ? null : groupEvent(raw);
  }
  async event(hash: string): Promise<GroupEvent | null> {
    const raw = await this.get(`governance:${hash}`);
    return raw === null ? null : groupEvent(raw);
  }
  async preserve(event: GroupEvent): Promise<void> {
    await this.put(`governance:${await groupEventHash(event)}`, event);
    await this.put('governance-current', event);
  }
  async page(
    prefix: string,
    after: string | null,
  ): Promise<{
    items: { name: string; value: unknown }[];
    next: string | null;
  }> {
    const page = await localPage<LocalCipher>(this.scope, prefix, after),
      items = [];
    for (const row of page.items)
      items.push({
        name: row.name,
        value: await this.open(row.name, row.value),
      });
    return { items, next: page.next };
  }
  remove(name: string): Promise<void> {
    return localDelete(this.scope, name);
  }
  async messages(
    before: number | null,
  ): Promise<{ items: unknown[]; next: string | null }> {
    const page = await localPrevious<LocalCipher>(
        this.scope,
        'message:',
        before === null ? null : `message:${String(before).padStart(16, '0')}`,
      ),
      items: unknown[] = [];
    for (const row of page.items)
      items.push(await this.open(row.name, row.value));
    return { items, next: page.next };
  }
}
