import { assertPersonalCleanupTarget } from './personal-cleanup-authority.ts';
import type { PersonalCleanupTarget } from './personal-cleanup-authority.ts';
import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { BackupTarget } from '../../shared/backups/index.ts';
import type { MessageProof } from '../../shared/messages/index.ts';
import type { ContentWriteAllocations } from './content-write-allocations.ts';
import { assertContentReclamationCapacity } from './content-capacity.ts';
import type { AdaptiveContentCapacity } from './content-capacity.ts';

interface RemovalSelection {
  accountId: string;
  participants: readonly string[];
  items: BackupTarget[];
  proof: MessageProof;
}
interface CleanupRecord extends PersonalCleanupTarget {
  expected_hash: string;
  prior: string | null;
}

/** Owns private removal envelopes on the already budgeted coordinator. */
export class MessageRemovalAllocations {
  private readonly allocations: ContentWriteAllocations;
  private readonly capacity: AdaptiveContentCapacity;
  constructor(
    allocations: ContentWriteAllocations,
    capacity: AdaptiveContentCapacity,
  ) {
    this.allocations = allocations;
    this.capacity = capacity;
  }
  async remove(
    client: pg.PoolClient,
    input: Omit<RemovalSelection, 'items'> & { id: string; hash: string },
  ): Promise<void> {
    await this.prepare(client, {
      ...input,
      kind: 'delete',
      items: [{ kind: 'message', id: input.id, hash: input.hash }],
    });
  }
  async clean(client: pg.PoolClient, input: RemovalSelection): Promise<void> {
    // Keep the existing public errors before allocating; SQL independently checks
    // the same bound scope, and the owner still validates each sequential effect.
    const result = await client.query<CleanupRecord>(
      `SELECT selected.hash AS expected_hash,prior.hash AS prior,m.hash,m.sender,m.recipient,m.body IS NOT NULL AS available
       FROM jsonb_to_recordset($2::jsonb) AS selected(id uuid,hash text)
       LEFT JOIN hash_talk.personal_removals prior ON prior.account_id=$1 AND prior.kind='message' AND prior.id=selected.id
       LEFT JOIN hash_talk.message_packets m ON m.id=selected.id ORDER BY selected.id`,
      [input.accountId, JSON.stringify(input.items)],
    );
    for (const row of result.rows) validateCleanup(row, input.accountId);
    await this.prepare(client, { ...input, kind: 'clean' });
  }
  private async prepare(
    client: pg.PoolClient,
    input: RemovalSelection & { kind: 'delete' | 'clean' },
  ): Promise<void> {
    const serialized = JSON.stringify(input.proof);
    const result = await client.query<{
      bytes: string | null;
      operation: string | null;
    }>(
      `SELECT bytes::text,operation::text FROM hash_talk.prepare_message_removal($1,$2,$3::jsonb,$4::jsonb,$5,$6::uuid[])`,
      [
        input.kind,
        input.accountId,
        JSON.stringify(input.items),
        serialized,
        Buffer.byteLength(serialized),
        input.participants,
      ],
    );
    const plan = result.rows[0]!;
    if (plan.bytes === null || plan.operation === null) return;
    await this.allocations.declare(client, {
      bytes: Number(plan.bytes),
      scope: 'message-remove',
      accountId: input.accountId,
      id: plan.operation,
      verify: async (owner) => {
        await owner.query('SELECT hash_talk.assert_message_removal_complete()');
        await assertContentReclamationCapacity(owner, this.capacity);
      },
    });
  }
}
function validateCleanup(row: CleanupRecord, account: string): void {
  if (row.prior !== null) {
    if (row.prior !== row.expected_hash)
      throw new AccountError(409, 'Seleção de limpeza divergente.');
    return;
  }
  assertPersonalCleanupTarget(row, { account, hash: row.expected_hash });
}
