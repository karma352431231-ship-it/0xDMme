import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { GroupEvent } from '../../shared/groups/index.ts';
import type { GroupPacket } from '../../shared/group-messages/index.ts';
import type { MessageProof } from '../../shared/messages/index.ts';
import type { GroupStore } from './groups.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { DeviceStore } from './devices.ts';

/** A finite cut (v2): later appends belong to a successor cut, while any later
 * removal or concealment still rejects it. Every row it returns has a sequence
 * at or below `anchor`, the highest packet sequence when the cut was chosen. */
export interface GroupMessageCut {
  anchor: number;
  invalidation: number;
}
export interface GroupMessageScope {
  groupId: string;
  head: string;
  revision: number;
  /** Absent for v1 scopes, which keep exact revision equality. */
  cut?: GroupMessageCut;
}
/** The sequence ceiling for a scope's reads; null for v1 scopes. */
export function cutAnchor(scope: GroupMessageScope): number | null {
  return scope.cut?.anchor ?? null;
}
export type GroupChangePage =
  | { reset: true }
  | {
      reset: false;
      from: number;
      revision: number;
      items: (Omit<IndexRow, 'sequence'> & { sequence: number })[];
      next: number | null;
    };
interface IndexRow {
  id: string;
  sequence: string;
  epoch: number;
  hash: string;
  sender: string;
  relation: unknown;
  deletion: unknown;
  deleted: boolean;
}
/** Membership locks and current revision protect every metadata range. */
export class GroupMessageUpdates {
  private readonly services: {
    groups: GroupStore;
    contacts: ContactStore;
    devices: DeviceStore;
  };
  constructor(services: {
    groups: GroupStore;
    contacts: ContactStore;
    devices: DeviceStore;
  }) {
    this.services = services;
  }
  async snapshot(
    a: ContactAuthority,
    scope: { groupId: string; head: string },
  ) {
    return this.services.groups.withGroupAuthority(
      a,
      scope,
      async (client) => ({
        ...scope,
        directory: a.directory,
        ...(await this.cut(client, scope.groupId)),
      }),
    );
  }
  async confirm(a: ContactAuthority, scope: GroupMessageScope): Promise<void> {
    await this.services.groups.withGroupAuthority(a, scope, (client) =>
      this.expect(client, scope),
    );
  }
  async index(
    a: ContactAuthority,
    input: GroupMessageScope & { after: number },
  ) {
    return this.services.groups.withGroupAuthority(
      a,
      input,
      async (client, state) => {
        await this.expect(client, input);
        const rows = await client.query<IndexRow>(
          'SELECT id,sequence::text,epoch,hash,sender,relation,deletion,(body IS NULL) AS deleted FROM hash_talk.group_packets WHERE group_id=$1 AND epoch>=$2 AND epoch<=$3 AND sequence>$4 AND ($5::bigint IS NULL OR sequence<=$5) ORDER BY sequence::bigint LIMIT 16',
          [
            input.groupId,
            this.joined(state, a),
            state.epoch,
            input.after,
            cutAnchor(input),
          ],
        );
        return {
          items: rows.rows.map((row) => ({
            ...row,
            sequence: Number(row.sequence),
          })),
          next: rows.rows.length ? Number(rows.rows.at(-1)!.sequence) : null,
        };
      },
    );
  }
  async changes(
    a: ContactAuthority,
    input: GroupMessageScope & { from: number; after: number },
  ) {
    return this.services.groups.withGroupAuthority(
      a,
      input,
      async (client, state) => {
        await this.expect(client, input);
        return this.changesWithin(client, { a, state, input });
      },
    );
  }
  /** One change page of a scope already checked in this transaction. */
  async changesWithin(
    client: pg.PoolClient,
    c: {
      a: ContactAuthority;
      state: GroupEvent;
      input: GroupMessageScope & { from: number; after: number };
    },
  ): Promise<GroupChangePage> {
    const { a, state, input } = c;
    if (
      input.from > input.revision ||
      input.revision - input.from > 256 ||
      input.after < input.from ||
      input.after > input.revision
    )
      return { reset: true };
    const changes = await client.query<{
      revision: string;
      message_id: string;
    }>(
      'SELECT c.revision::text,c.message_id FROM hash_talk.group_message_changes c WHERE c.group_id=$1 AND c.revision>$2 AND c.revision<=$3 ORDER BY c.revision LIMIT 16',
      [input.groupId, input.after, input.revision],
    );
    let cursor = input.after;
    for (const row of changes.rows)
      if (Number(row.revision) !== ++cursor) return { reset: true };
    if (cursor < input.revision && changes.rows.length < 16)
      return { reset: true };
    const ids = [...new Set(changes.rows.map((row) => row.message_id))];
    const rows = await client.query<IndexRow>(
      'SELECT id,sequence::text,epoch,hash,sender,relation,deletion,(body IS NULL) AS deleted FROM hash_talk.group_packets WHERE group_id=$1 AND epoch>=$2 AND epoch<=$3 AND id=ANY($4::uuid[]) AND ($5::bigint IS NULL OR sequence<=$5) ORDER BY sequence::bigint LIMIT 16',
      [
        input.groupId,
        this.joined(state, a),
        state.epoch,
        ids,
        cutAnchor(input),
      ],
    );
    return {
      reset: false,
      from: input.from,
      revision: input.revision,
      items: rows.rows.map((row) => ({
        ...row,
        sequence: Number(row.sequence),
      })),
      next: cursor < input.revision ? cursor : null,
    };
  }
  async remove(
    a: ContactAuthority,
    input: { groupId: string; head: string; id: string; hash: string },
    proof: MessageProof,
  ): Promise<void> {
    await this.services.groups.withGroupAuthority(
      a,
      input,
      async (client, state) => {
        const current = await this.services.devices.currentInTransaction(
          client,
          a.session.accountId,
        );
        if (proof.payload['revision'] !== current.revision)
          throw new AccountError(409, 'Deletion authorization has changed.');
        const result = await client.query<{
          sender: string;
          hash: string;
          epoch: number;
          kind: string;
          relation: unknown;
          deletion: unknown;
        }>(
          'SELECT sender,hash,epoch,kind,relation,deletion FROM hash_talk.group_packets WHERE group_id=$1 AND id=$2 FOR UPDATE',
          [input.groupId, input.id],
        );
        const root = result.rows[0];
        if (
          !root ||
          root.sender !== a.session.accountId ||
          root.hash !== input.hash ||
          root.epoch < this.joined(state, a) ||
          root.relation ||
          root.kind === 'profile'
        )
          throw new AccountError(
            403,
            'Only the author who is a group participant can delete their message.',
          );
        if (
          root.deletion &&
          (root.deletion as { type?: unknown }).type === 'message'
        )
          return;
        const deletion = {
          type: 'message',
          accountId: a.session.accountId,
          proof,
        };
        await client.query(
          "UPDATE hash_talk.group_packets SET body=NULL,deletion=$3::jsonb,key_hash=NULL,pending_accounts='{}',received_accounts='{}',charge=$4 WHERE group_id=$1 AND (id=$2 OR relation->>'id'=$2::text)",
          [
            input.groupId,
            input.id,
            JSON.stringify(deletion),
            512 + Buffer.byteLength(JSON.stringify(deletion)),
          ],
        );
        await client.query(
          "UPDATE hash_talk.group_media SET status='deleting' WHERE group_id=$1 AND message_id=$2 AND status NOT IN ('writing','deleting')",
          [input.groupId, input.id],
        );
        this.services.contacts.removed(
          client,
          state.members.map((member) => member.accountId),
          'group-messages',
        );
      },
    );
  }
  async available(
    a: ContactAuthority,
    input: { groupId: string; head: string; id: string; hash: string },
  ): Promise<boolean> {
    return this.services.groups.withGroupAuthority(
      a,
      input,
      async (client, state) => {
        const rows = await client.query(
          "SELECT 1 FROM hash_talk.group_packets WHERE group_id=$1 AND id=$2 AND hash=$3 AND epoch>=$4 AND epoch<=$5 AND (deletion IS NULL OR deletion->>'type' IS DISTINCT FROM 'message')",
          [
            input.groupId,
            input.id,
            input.hash,
            this.joined(state, a),
            state.epoch,
          ],
        );
        return rows.rowCount === 1;
      },
    );
  }
  private joined(state: GroupEvent, a: ContactAuthority): number {
    const joined = state.members.find(
      (member) => member.accountId === a.session.accountId,
    )?.joined;
    if (!joined) throw new AccountError(403, 'Membership unavailable.');
    return joined;
  }
  /** Called under the group row lock, which also serializes packet inserts,
   * so the highest sequence bounds every packet visible at this revision. */
  async cut(client: pg.PoolClient, group: string) {
    const rows = await client.query<{
      revision: string;
      invalidation: string;
      anchor: string;
    }>(
      'SELECT g.message_revision::text AS revision,g.message_invalidation::text AS invalidation,(SELECT coalesce(max(p.sequence),0)::text FROM hash_talk.group_packets p WHERE p.group_id=g.id) AS anchor FROM hash_talk.groups g WHERE g.id=$1',
      [group],
    );
    const row = rows.rows[0]!;
    return {
      revision: Number(row.revision),
      anchor: Number(row.anchor),
      invalidation: Number(row.invalidation),
    };
  }
  async expect(client: pg.PoolClient, scope: GroupMessageScope): Promise<void> {
    const rows = await client.query<{ revision: string; invalidation: string }>(
      'SELECT message_revision::text AS revision,message_invalidation::text AS invalidation FROM hash_talk.groups WHERE id=$1',
      [scope.groupId],
    );
    const current = {
      revision: Number(rows.rows[0]!.revision),
      invalidation: Number(rows.rows[0]!.invalidation),
    };
    if (!currentCut(scope, current))
      throw new AccountError(
        409,
        'Group messages have changed. Verify them again.',
      );
  }
}
/** v1 scopes need the exact revision. A v2 cut stays current through later
 * appends; a later removal advances the invalidation fence and rejects it. */
function currentCut(
  scope: GroupMessageScope,
  current: { revision: number; invalidation: number },
): boolean {
  if (!scope.cut) return current.revision === scope.revision;
  return (
    scope.revision <= current.revision &&
    scope.cut.invalidation <= scope.revision &&
    scope.cut.invalidation === current.invalidation
  );
}
export async function assertGroupEdit(
  client: pg.PoolClient,
  packet: GroupPacket,
  state: GroupEvent,
): Promise<void> {
  const relation = packet.relation;
  if (!relation) return;
  const rows = await client.query<{
    hash: string;
    sender: string;
    kind: string;
    epoch: number;
    body: unknown;
    relation: unknown;
  }>(
    'SELECT hash,sender,kind,epoch,body,relation FROM hash_talk.group_packets WHERE group_id=$1 AND id=$2 FOR UPDATE',
    [packet.groupId, relation.id],
  );
  const root = editableRoot(rows.rows[0]);
  assertEditOwner(root, { packet, relation, state });
  const count = await client.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM hash_talk.group_packets WHERE group_id=$1 AND relation->>'id'=$2",
    [packet.groupId, relation.id],
  );
  if ((count.rows[0]?.count ?? 0) >= 64)
    throw new AccountError(413, 'This message has reached 64 edits.');
}

interface EditRoot {
  hash: string;
  sender: string;
  kind: string;
  epoch: number;
  body: unknown;
  relation: unknown;
}
function editableRoot(root: EditRoot | undefined): EditRoot {
  if (!root || root.kind !== 'text' || root.relation || !root.body)
    throw new AccountError(403, 'Edit is outside your authorized message.');
  return root;
}
function assertEditOwner(
  root: EditRoot,
  input: {
    packet: GroupPacket;
    relation: NonNullable<GroupPacket['relation']>;
    state: GroupEvent;
  },
): void {
  const joined =
    input.state.members.find(
      (member) => member.accountId === input.packet.sender,
    )?.joined ?? Infinity;
  if (
    root.sender !== input.packet.sender ||
    input.relation.author !== input.packet.sender ||
    root.hash !== input.relation.hash ||
    root.epoch < joined
  )
    throw new AccountError(403, 'Edit is outside your authorized message.');
}
