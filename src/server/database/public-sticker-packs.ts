import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AccountError, uuid } from '../../shared/account/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import { publicStickerLimits } from '../../shared/public-stickers/index.ts';
import type { ContentCapacity } from './content-capacity.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { PublicStickers } from './public-stickers.ts';
import { assertContentCapacity } from './vault-quota.ts';

/**
 * Public sticker packs (24/11/2026): a named, ordered list of up to 30 of the
 * owner's public stickers. Other profiles add packs to their sticker panel;
 * a pack shows only stickers whose review is currently released.
 */
export interface StickerPack {
  id: string;
  name: string;
  owner: { id: string; handle: string };
  adds: number;
  stickers: string[];
  added: boolean;
  own: boolean;
}
interface PackRow {
  id: string;
  name: string;
  owner: string;
  handle: string;
  adds: number;
  created_at: Date;
}
type Reader = Pick<pg.PoolClient, 'query'>;
const packColumns =
  'p.id,p.name,p.owner,pp.handle,p.adds,p.created_at FROM hash_talk.public_sticker_packs p JOIN hash_talk.public_profiles pp ON pp.id=p.owner';
const pageSize = 24;
interface PackOptions {
  authority: ContactStore;
  identity: (client: pg.PoolClient, account: string) => Promise<PublicProfile>;
  capacity: ContentCapacity;
  stickers: PublicStickers;
}

export class PublicStickerPacks {
  private readonly options: PackOptions;
  constructor(options: PackOptions) {
    this.options = options;
  }
  private profile(client: pg.PoolClient, authority: ContactAuthority) {
    return this.options.identity(client, authority.session.accountId);
  }
  private async items(client: Reader, packs: string[]) {
    const rows = await client.query<{ pack: string; sticker: string }>(
      'SELECT pack,sticker FROM hash_talk.public_sticker_pack_items WHERE pack=ANY($1::uuid[]) ORDER BY pack,position',
      [packs],
    );
    const visible = await this.options.stickers.visible(
      client,
      rows.rows.map((row) => row.sticker),
    );
    const byPack = new Map<string, string[]>();
    for (const row of rows.rows)
      if (visible.has(row.sticker))
        byPack.set(row.pack, [...(byPack.get(row.pack) ?? []), row.sticker]);
    return byPack;
  }
  private async project(
    client: Reader,
    rows: readonly PackRow[],
    viewer: string,
  ): Promise<StickerPack[]> {
    const ids = rows.map((row) => row.id);
    const items = await this.items(client, ids);
    const added = await client.query<{ pack: string }>(
      'SELECT pack FROM hash_talk.public_sticker_pack_adds WHERE profile=$1 AND pack=ANY($2::uuid[])',
      [viewer, ids],
    );
    const addedSet = new Set(added.rows.map((row) => row.pack));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      owner: { id: row.owner, handle: row.handle },
      adds: row.adds,
      stickers: items.get(row.id) ?? [],
      added: addedSet.has(row.id),
      own: row.owner === viewer,
    }));
  }
  /** Creates (id null) or replaces the name and stickers of an own pack. */
  save(
    authority: ContactAuthority,
    input: { id: string | null; name: string; stickers: string[] },
  ) {
    return this.options.authority.withMessageAuthority(
      authority,
      async (client) => {
        const profile = await this.profile(client, authority);
        const id = input.id
          ? await this.ownPack(client, profile.id, input.id)
          : await this.createPack(client, profile.id, input.name);
        const owned = await this.options.stickers.owned(
          client,
          profile.id,
          input.stickers,
        );
        if (owned.length !== input.stickers.length)
          throw new AccountError(400, 'Packs hold only your own stickers.');
        await client.query(
          'UPDATE hash_talk.public_sticker_packs SET name=$2 WHERE id=$1 AND name<>$2',
          [id, input.name],
        );
        await client.query(
          'DELETE FROM hash_talk.public_sticker_pack_items WHERE pack=$1',
          [id],
        );
        if (input.stickers.length)
          await client.query(
            `INSERT INTO hash_talk.public_sticker_pack_items(pack,sticker,position)
              SELECT $1,sticker,position-1 FROM unnest($2::uuid[]) WITH ORDINALITY AS item(sticker,position)`,
            [id, input.stickers],
          );
        await assertContentCapacity(client, this.options.capacity);
        const rows = await client.query<PackRow>(
          `SELECT ${packColumns} WHERE p.id=$1`,
          [id],
        );
        return (await this.project(client, rows.rows, profile.id))[0]!;
      },
    );
  }
  private async ownPack(
    client: pg.PoolClient,
    owner: string,
    id: string,
  ): Promise<string> {
    const found = await client.query<{ id: string }>(
      'SELECT id FROM hash_talk.public_sticker_packs WHERE id=$1 AND owner=$2 FOR UPDATE',
      [uuid(id), owner],
    );
    if (!found.rows[0]) throw new AccountError(404, 'Pack unavailable.');
    return found.rows[0].id;
  }
  private async createPack(
    client: pg.PoolClient,
    owner: string,
    name: string,
  ): Promise<string> {
    await client.query(
      'SELECT id FROM hash_talk.public_profiles WHERE id=$1 FOR UPDATE',
      [owner],
    );
    const count = await client.query<{ total: string }>(
      'SELECT count(*) AS total FROM hash_talk.public_sticker_packs WHERE owner=$1',
      [owner],
    );
    if (
      Number(count.rows[0]?.total ?? 0) >= publicStickerLimits.packsPerProfile
    )
      throw new AccountError(409, 'Pack limit reached. Delete a pack first.');
    const id = randomUUID();
    await client.query(
      'INSERT INTO hash_talk.public_sticker_packs(id,owner,name) VALUES($1,$2,$3)',
      [id, owner, name],
    );
    return id;
  }
  remove(authority: ContactAuthority, id: string) {
    return this.options.authority.withMessageAuthority(
      authority,
      async (client) => {
        const profile = await this.profile(client, authority);
        await this.ownPack(client, profile.id, id);
        await client.query(
          'DELETE FROM hash_talk.public_sticker_packs WHERE id=$1',
          [uuid(id)],
        );
        return { removed: true as const };
      },
    );
  }
  /** Adds or drops another profile's pack in the viewer's panel. */
  add(authority: ContactAuthority, id: string, added: boolean) {
    return this.options.authority.withMessageAuthority(
      authority,
      async (client) => {
        const profile = await this.profile(client, authority);
        const pack = await client.query<{ id: string }>(
          'SELECT id FROM hash_talk.public_sticker_packs WHERE id=$1 FOR UPDATE',
          [uuid(id)],
        );
        if (!pack.rows[0]) throw new AccountError(404, 'Pack unavailable.');
        if (added) await this.addPack(client, profile.id, pack.rows[0].id);
        else await this.dropPack(client, profile.id, pack.rows[0].id);
        await assertContentCapacity(client, this.options.capacity);
        return { added };
      },
    );
  }
  private async addPack(client: pg.PoolClient, profile: string, pack: string) {
    const count = await client.query<{ total: string }>(
      'SELECT count(*) AS total FROM hash_talk.public_sticker_pack_adds WHERE profile=$1',
      [profile],
    );
    if (Number(count.rows[0]?.total ?? 0) >= publicStickerLimits.addedPacks)
      throw new AccountError(409, 'Remove a pack before adding another.');
    const inserted = await client.query(
      'INSERT INTO hash_talk.public_sticker_pack_adds(profile,pack) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [profile, pack],
    );
    if (inserted.rowCount)
      await client.query(
        'UPDATE hash_talk.public_sticker_packs SET adds=adds+1 WHERE id=$1',
        [pack],
      );
  }
  private async dropPack(client: pg.PoolClient, profile: string, pack: string) {
    const removed = await client.query(
      'DELETE FROM hash_talk.public_sticker_pack_adds WHERE profile=$1 AND pack=$2',
      [profile, pack],
    );
    if (removed.rowCount)
      await client.query(
        'UPDATE hash_talk.public_sticker_packs SET adds=greatest(adds-1,0) WHERE id=$1',
        [pack],
      );
  }
  /** The viewer's own packs and the packs they added, for the panel. */
  panel(authority: ContactAuthority) {
    return this.options.authority.withMessageAuthority(
      authority,
      async (client) => {
        const profile = await this.profile(client, authority);
        const rows = await client.query<PackRow>(
          `SELECT ${packColumns} WHERE p.owner=$1
            UNION ALL SELECT ${packColumns} JOIN hash_talk.public_sticker_pack_adds a
              ON a.pack=p.id AND a.profile=$1 WHERE p.owner<>$1
            ORDER BY created_at DESC,id DESC LIMIT $2`,
          [
            profile.id,
            publicStickerLimits.packsPerProfile +
              publicStickerLimits.addedPacks,
          ],
        );
        return this.project(client, rows.rows, profile.id);
      },
    );
  }
  /** Most added packs first, then newest; `after` continues the list. */
  browse(authority: ContactAuthority, after: number) {
    return this.options.authority.withMessageAuthority(
      authority,
      async (client) => {
        const profile = await this.profile(client, authority);
        const rows = await client.query<PackRow>(
          `SELECT ${packColumns} WHERE EXISTS(SELECT 1 FROM hash_talk.public_sticker_pack_items i WHERE i.pack=p.id)
            ORDER BY p.adds DESC,p.created_at DESC,p.id DESC OFFSET $1 LIMIT $2`,
          [after, pageSize + 1],
        );
        const packs = await this.project(
          client,
          rows.rows.slice(0, pageSize),
          profile.id,
        );
        return {
          packs: packs.filter((pack) => pack.stickers.length),
          next: rows.rows.length > pageSize ? after + pageSize : null,
        };
      },
    );
  }
  /** One pack, for a tapped sticker's "see pack". */
  read(authority: ContactAuthority, id: string) {
    return this.options.authority.withMessageAuthority(
      authority,
      async (client) => {
        const profile = await this.profile(client, authority);
        const rows = await client.query<PackRow>(
          `SELECT ${packColumns} WHERE p.id=$1`,
          [uuid(id)],
        );
        const pack = (await this.project(client, rows.rows, profile.id))[0];
        if (!pack) throw new AccountError(404, 'Pack unavailable.');
        return pack;
      },
    );
  }
  /** The first pack holding a sticker, so a tapped sticker can show it. */
  containing(authority: ContactAuthority, sticker: string) {
    return this.options.authority.withMessageAuthority(
      authority,
      async (client) => {
        const profile = await this.profile(client, authority);
        const rows = await client.query<PackRow>(
          `SELECT ${packColumns} JOIN hash_talk.public_sticker_pack_items i ON i.pack=p.id
            WHERE i.sticker=$1 ORDER BY p.adds DESC,p.created_at,p.id LIMIT 1`,
          [uuid(sticker)],
        );
        return (await this.project(client, rows.rows, profile.id))[0] ?? null;
      },
    );
  }
}
