import type { MessageRelation } from '../../shared/daily/index.ts';
import { groupQuota } from '../../shared/group-quota/index.ts';
import { object } from '../../shared/account/index.ts';
import { groupEvent } from '../../shared/groups/index.ts';
import type { GroupEvent } from '../../shared/groups/index.ts';
import { groupEventHash } from '../../shared/groups/index.ts';
import {
  localGet,
  localPutBatchWithin,
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
export function groupMessageRecordName(row: {
  sequence: number;
  relation?: MessageRelation;
}): string {
  return `${row.relation ? 'action' : 'message'}:${String(row.sequence).padStart(16, '0')}`;
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
    await this.putMany([{ name, value }]);
  }
  async putMany(
    records: readonly { name: string; value: unknown }[],
  ): Promise<void> {
    const sealed = [];
    for (const { name, value } of records) {
      const text = JSON.stringify({ scope: this.scope, name, value }),
        chunks: LocalCipher[] = [];
      for (let offset = 0; offset < text.length;) {
        let end = Math.min(text.length, offset + 65536);
        if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) end--;
        chunks.push(
          await sealLocal(
            this.authority,
            crypto.randomUUID(),
            text.slice(offset, end),
          ),
        );
        offset = end;
      }
      const stored = chunks.length === 1 ? chunks[0]! : { chunks };
      sealed.push({
        name,
        value: stored,
        size: chunks.reduce((total, c) => total + c.bytes.length + 512, 0),
      });
    }
    await localPutBatchWithin({
      scope: this.scope,
      records: sealed,
      maximum: groupQuota,
    });
  }
  private async open(
    name: string,
    row: LocalCipher | { chunks: LocalCipher[] },
  ): Promise<unknown> {
    const chunks = 'chunks' in row ? row.chunks : [row];
    if (!chunks.length || chunks.length > 512)
      throw new Error('Invalid group cache record.');
    const parts = [];
    for (const chunk of chunks)
      parts.push(await openLocal(this.authority, chunk));
    const data = object(JSON.parse(parts.join('')) as unknown);
    if (data['scope'] !== this.scope || data['name'] !== name)
      throw new Error('Cache belongs to another group or record.');
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
  /** Explicit root deletion also erases its per-author reaction snapshots. */
  async removeReactions(id: string): Promise<void> {
    let after: string | null = null;
    do {
      const page: { items: { name: string }[]; next: string | null } =
        await localPage<LocalCipher>(this.scope, `reaction:${id}:`, after);
      for (const row of page.items) await this.remove(row.name);
      after = page.next;
    } while (after !== null);
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
