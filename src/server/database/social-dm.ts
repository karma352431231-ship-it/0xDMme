import type { ContentCapacity } from './content-capacity.ts';
import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { PublicProfileStore } from './public-profile.ts';
import { assertContentCapacity, assertVaultQuota } from './vault-quota.ts';
import { openSocialConversation } from './social-conversations.ts';
import type { SocialRelationRow } from './social-conversations.ts';

export interface SocialContext {
  client: pg.PoolClient;
  actor: PublicProfile;
  authority: ContactAuthority;
}
export class SocialDmStore {
  private readonly contacts: ContactStore;
  private readonly profiles: PublicProfileStore;
  private readonly capacity: ContentCapacity;
  constructor(input: {
    contacts: ContactStore;
    profiles: PublicProfileStore;
    capacity: ContentCapacity;
  }) {
    this.contacts = input.contacts;
    this.profiles = input.profiles;
    this.capacity = input.capacity;
  }
  /** All social effects share the existing short device/session admission transaction. */
  async withActor<T>(
    authority: ContactAuthority,
    work: (context: SocialContext) => Promise<T>,
  ): Promise<T> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const actor = await this.profiles.identity(
        client,
        authority.session.accountId,
      );
      return work({ client, actor, authority });
    });
  }
  /** Read one optional public identity under current session/device authority. */
  async withOptionalActorRead<T>(
    authority: ContactAuthority,
    work: (context: SocialContext | null) => Promise<T>,
  ): Promise<T> {
    return this.contacts.withMessageRead(authority, async (client) => {
      const actor = await this.profiles.identityOrNull(
        client,
        authority.session.accountId,
      );
      return work(actor ? { client, actor, authority } : null);
    });
  }
  maintenance<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    return this.contacts.withMaintenance(work);
  }
  async changed(context: SocialContext, profiles: string[]): Promise<void> {
    const accounts = await Promise.all(
      [...new Set(profiles)].map((id) =>
        this.profiles.accountFor(context.client, id),
      ),
    );
    this.contacts.changed(context.client, accounts);
  }
  async deliveryBatch(
    context: SocialContext,
    peers: string[],
  ): Promise<Set<string>> {
    const result = await context.client.query<{ peer: string }>(
      `SELECT CASE WHEN r.lo=$1 THEN r.hi ELSE r.lo END AS peer FROM hash_talk.social_relations r WHERE ((r.lo=$1 AND r.hi=ANY($2::uuid[])) OR (r.hi=$1 AND r.lo=ANY($2::uuid[]))) AND NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.blocked AND ((b.actor=r.lo AND b.target=r.hi) OR (b.actor=r.hi AND b.target=r.lo)))`,
      [context.actor.id, peers],
    );
    return new Set(result.rows.map((row) => row.peer));
  }
  async withDeliveryClient(
    client: pg.PoolClient,
    authority: ContactAuthority,
    peer: string,
  ): Promise<boolean> {
    const actor = await this.profiles.identity(
      client,
      authority.session.accountId,
    );
    return (await this.deliveryBatch({ client, actor, authority }, [peer])).has(
      peer,
    );
  }
  async limits(
    context: SocialContext,
    profiles: string[] = [context.actor.id],
  ): Promise<void> {
    for (const profile of [...new Set(profiles)])
      await assertVaultQuota(
        context.client,
        await this.profiles.accountFor(context.client, profile),
      );
    await assertContentCapacity(context.client, this.capacity);
  }
  async target(context: SocialContext, id: string): Promise<PublicProfile> {
    if (id === context.actor.id)
      throw new AccountError(400, 'A DM requires two people.');
    const target = (await this.profiles.identities(context.client, [id])).get(
      id,
    );
    if (!target) throw new AccountError(404, 'Public profile unavailable.');
    return target;
  }
  async blocked(context: SocialContext, peer: string): Promise<boolean> {
    const found = await context.client.query(
      'SELECT 1 FROM hash_talk.social_blocks WHERE blocked AND ((actor=$1 AND target=$2) OR (actor=$2 AND target=$1))',
      [context.actor.id, peer],
    );
    return Boolean(found.rowCount);
  }
  async requireConversation(
    context: SocialContext,
    peer: string,
  ): Promise<void> {
    if (peer === context.actor.id) return;
    const row = await this.relation(context, peer);
    if (!row || (await this.blocked(context, peer)))
      throw new AccountError(403, 'DM unavailable.');
  }
  private async relation(
    context: SocialContext,
    peer: string,
  ): Promise<SocialRelationRow | null> {
    const result = await context.client.query<SocialRelationRow>(
      'SELECT lo,hi,requester,state,revision::text FROM hash_talk.social_relations WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)',
      [context.actor.id, peer],
    );
    return result.rows[0] ?? null;
  }
  private async projection(
    context: SocialContext,
    row: SocialRelationRow,
    peer: PublicProfile,
  ): Promise<SocialRelation> {
    const own = await this.ownBlock(context, peer.id);
    return {
      peer,
      requester: row.requester,
      state: row.state,
      revision: Number(row.revision),
      blocked: own.blocked,
      blockRevision: own.revision,
      canSend: !(await this.blocked(context, peer.id)),
    };
  }
  async state(
    authority: ContactAuthority,
    peer: string,
  ): Promise<SocialRelation | null> {
    return this.withActor(authority, async (context) => {
      const target = await this.target(context, peer),
        row = await this.relation(context, peer);
      if (row) return this.projection(context, row, target);
      const own = await this.ownBlock(context, peer);
      return own.revision
        ? {
            peer: target,
            requester: peer,
            state: 'none' as const,
            revision: 0,
            blocked: own.blocked,
            blockRevision: own.revision,
            canSend: false,
          }
        : null;
    });
  }
  async list(authority: ContactAuthority, after: string | null) {
    return this.withActor(authority, async (context) => {
      const rows = await context.client.query<
        SocialRelationRow & { peer: string }
      >(
        `WITH peers AS (
          SELECT lo,hi,requester,state,revision::text,CASE WHEN lo=$1 THEN hi ELSE lo END AS peer FROM hash_talk.social_relations WHERE lo=$1 OR hi=$1
          UNION ALL SELECT least(actor,target),greatest(actor,target),target,'none','0',target FROM hash_talk.social_blocks b WHERE blocked AND actor=$1 AND NOT EXISTS(SELECT 1 FROM hash_talk.social_relations r WHERE r.lo=least(b.actor,b.target) AND r.hi=greatest(b.actor,b.target))
        ) SELECT * FROM peers WHERE ($2::uuid IS NULL OR peer>$2) ORDER BY peer LIMIT 17`,
        [context.actor.id, after],
      );
      const page = rows.rows.slice(0, 16),
        profiles = await this.profiles.identities(
          context.client,
          page.map((row) => row.peer),
        );
      const blocks = await context.client.query<{
        actor: string;
        target: string;
        blocked: boolean;
        revision: string;
      }>(
        'SELECT actor,target,blocked,revision::text FROM hash_talk.social_blocks WHERE (actor=$1 AND target=ANY($2::uuid[])) OR (target=$1 AND actor=ANY($2::uuid[]))',
        [context.actor.id, page.map((row) => row.peer)],
      );
      return {
        items: page.map((row) => {
          const peer = profiles.get(row.peer);
          if (!peer) throw new Error('Perfil de DM ausente.');
          return {
            peer,
            requester: row.requester,
            state: row.state,
            revision: Number(row.revision),
            blocked: blocks.rows.some(
              (b) =>
                b.blocked &&
                b.actor === context.actor.id &&
                b.target === row.peer,
            ),
            blockRevision: Number(
              blocks.rows.find(
                (b) => b.actor === context.actor.id && b.target === row.peer,
              )?.revision ?? 0,
            ),
            canSend: !blocks.rows.some(
              (b) =>
                b.blocked && (b.actor === row.peer || b.target === row.peer),
            ),
          };
        }),
        next: rows.rows.length > 16 ? (page.at(-1)?.peer ?? null) : null,
      };
    });
  }
  async open(authority: ContactAuthority, peer: string) {
    return this.withActor(authority, async (context) => {
      const target = await this.target(context, peer);
      if (await this.blocked(context, peer))
        throw new AccountError(403, 'DM unavailable.');
      const opened = await openSocialConversation({
        client: context.client,
        actor: context.actor.id,
        peer,
      });
      if (opened.created) await this.limits(context);
      if (opened.changed) await this.changed(context, [context.actor.id, peer]);
      return this.projection(context, opened.row, target);
    });
  }
  /** Compatibility for clients that still use the old request operation. */
  request(authority: ContactAuthority, peer: string) {
    return this.open(authority, peer);
  }
  async decide(
    authority: ContactAuthority,
    input: { peer: string; revision: number; accept: boolean },
  ) {
    if (!input.accept)
      return this.withActor(authority, () => {
        throw new AccountError(
          409,
          'DM requests have been disabled. Use Block to prevent messages.',
        );
      });
    return this.open(authority, input.peer);
  }
  private async ownBlock(
    context: SocialContext,
    peer: string,
  ): Promise<{ blocked: boolean; revision: number }> {
    const rows = await context.client.query<{
      blocked: boolean;
      revision: string;
    }>(
      'SELECT blocked,revision::text FROM hash_talk.social_blocks WHERE actor=$1 AND target=$2',
      [context.actor.id, peer],
    );
    return {
      blocked: rows.rows[0]?.blocked ?? false,
      revision: Number(rows.rows[0]?.revision ?? 0),
    };
  }
  async block(
    authority: ContactAuthority,
    input: { peer: string; blocked: boolean; revision: number },
  ): Promise<void> {
    await this.withActor(authority, async (context) => {
      await this.target(context, input.peer);
      const old = await this.ownBlock(context, input.peer);
      if (!blockChanges(old, input)) return;
      await context.client.query(
        'INSERT INTO hash_talk.social_blocks(actor,target,blocked,revision) VALUES($1,$2,$3,1) ON CONFLICT(actor,target) DO UPDATE SET blocked=excluded.blocked,revision=hash_talk.social_blocks.revision+1',
        [context.actor.id, input.peer, input.blocked],
      );
      await this.limits(context);
      await this.changed(context, [context.actor.id, input.peer]);
    });
  }
}
function blockChanges(
  old: { blocked: boolean; revision: number },
  next: { blocked: boolean; revision: number },
): boolean {
  if (old.revision === next.revision + 1 && old.blocked === next.blocked)
    return false;
  if (old.revision !== next.revision)
    throw new AccountError(409, 'DM block changed. Reload.');
  return old.blocked !== next.blocked;
}
