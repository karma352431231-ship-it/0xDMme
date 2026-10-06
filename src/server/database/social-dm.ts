import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { PublicProfileStore } from './public-profile.ts';
import { assertContentCapacity, assertVaultQuota } from './vault-quota.ts';

export interface SocialContext {
  client: pg.PoolClient;
  actor: PublicProfile;
  authority: ContactAuthority;
}
interface RelationRow {
  lo: string;
  hi: string;
  requester: string;
  state: SocialRelation['state'];
  revision: string;
}
export class SocialDmStore {
  private readonly contacts: ContactStore;
  private readonly profiles: PublicProfileStore;
  private readonly capacity: number;
  constructor(input: {
    contacts: ContactStore;
    profiles: PublicProfileStore;
    capacity: number;
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
      throw new AccountError(400, 'DM exige duas pessoas.');
    const target = (await this.profiles.identities(context.client, [id])).get(
      id,
    );
    if (!target) throw new AccountError(404, 'Perfil público indisponível.');
    return target;
  }
  async blocked(context: SocialContext, peer: string): Promise<boolean> {
    const found = await context.client.query(
      'SELECT 1 FROM hash_talk.social_blocks WHERE blocked AND ((actor=$1 AND target=$2) OR (actor=$2 AND target=$1))',
      [context.actor.id, peer],
    );
    return Boolean(found.rowCount);
  }
  async requireConsent(context: SocialContext, peer: string): Promise<void> {
    if (peer === context.actor.id) return;
    const row = await this.relation(context, peer);
    if (row?.state !== 'approved' || (await this.blocked(context, peer)))
      throw new AccountError(403, 'DM sem aceite atual ou indisponível.');
  }
  private async relation(
    context: SocialContext,
    peer: string,
  ): Promise<RelationRow | null> {
    const result = await context.client.query<RelationRow>(
      'SELECT lo,hi,requester,state,revision::text FROM hash_talk.social_relations WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)',
      [context.actor.id, peer],
    );
    return result.rows[0] ?? null;
  }
  private async projection(
    context: SocialContext,
    row: RelationRow,
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
      canSend:
        row.state === 'approved' && !(await this.blocked(context, peer.id)),
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
      const rows = await context.client.query<RelationRow & { peer: string }>(
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
            canSend:
              row.state === 'approved' &&
              !blocks.rows.some(
                (b) =>
                  b.blocked && (b.actor === row.peer || b.target === row.peer),
              ),
          };
        }),
        next: rows.rows.length > 16 ? (page.at(-1)?.peer ?? null) : null,
      };
    });
  }
  async request(authority: ContactAuthority, peer: string) {
    return this.withActor(authority, async (context) => {
      const target = await this.target(context, peer);
      if (await this.blocked(context, peer))
        throw new AccountError(403, 'DM indisponível.');
      let row = await this.relation(context, peer);
      if (row?.state === 'rejected') {
        if (row.requester === context.actor.id)
          throw new AccountError(
            403,
            'Solicitação recusada. O destinatário pode iniciar um novo pedido.',
          );
        await context.client.query(
          "UPDATE hash_talk.social_relations SET state='pending',requester=$3,revision=revision+1 WHERE lo=$1 AND hi=$2",
          [row.lo, row.hi, context.actor.id],
        );
        row = {
          ...row,
          state: 'pending',
          requester: context.actor.id,
          revision: String(Number(row.revision) + 1),
        };
      }
      if (!row) {
        const result = await context.client.query<RelationRow>(
          "INSERT INTO hash_talk.social_relations(lo,hi,requester,state,revision) VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'pending',1) RETURNING lo,hi,requester,state,revision::text",
          [context.actor.id, peer],
        );
        row = result.rows[0] ?? null;
        await this.limits(context);
      }
      if (!row) throw new Error('Solicitação não confirmada.');
      return this.projection(context, row, target);
    });
  }
  async decide(
    authority: ContactAuthority,
    input: { peer: string; revision: number; accept: boolean },
  ) {
    return this.withActor(authority, async (context) => {
      const target = await this.target(context, input.peer),
        row = await this.relation(context, input.peer);
      if (!row || row.requester === context.actor.id)
        throw new AccountError(
          403,
          'Somente o destinatário decide a solicitação.',
        );
      if (await this.blocked(context, input.peer))
        throw new AccountError(403, 'DM indisponível.');
      const state = input.accept ? 'approved' : 'rejected';
      if (row.state === state && Number(row.revision) === input.revision + 1)
        return this.projection(context, row, target);
      if (row.state !== 'pending' || Number(row.revision) !== input.revision)
        throw new AccountError(409, 'Solicitação mudou. Recarregue.');
      await context.client.query(
        'UPDATE hash_talk.social_relations SET state=$3,revision=revision+1 WHERE lo=$1 AND hi=$2',
        [row.lo, row.hi, state],
      );
      return this.projection(
        context,
        { ...row, state, revision: String(Number(row.revision) + 1) },
        target,
      );
    });
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
      if (input.blocked)
        await context.client.query(
          "UPDATE hash_talk.social_relations SET state='rejected',requester=$2,revision=revision+1 WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)",
          [context.actor.id, input.peer],
        );
      await this.limits(context);
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
    throw new AccountError(409, 'Bloqueio de DM mudou. Recarregue.');
  return old.blocked !== next.blocked;
}
