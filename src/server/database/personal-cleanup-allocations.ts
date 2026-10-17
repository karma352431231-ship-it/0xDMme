import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { BackupTarget } from '../../shared/backups/index.ts';
import type { MessageProof } from '../../shared/messages/index.ts';
import type { ContentWriteAllocations } from './content-write-allocations.ts';
import { assertContentReclamationCapacity } from './content-capacity.ts';
import type { AdaptiveContentCapacity } from './content-capacity.ts';
import { assertPersonalCleanupTarget } from './personal-cleanup-authority.ts';
import type { PersonalCleanupTarget } from './personal-cleanup-authority.ts';

interface CleanupInput {
  accountId: string;
  participants: readonly string[];
  items: BackupTarget[];
  proof: MessageProof;
  validateSocial: (
    client: pg.PoolClient,
    account: string,
    item: BackupTarget,
  ) => Promise<unknown>;
}
/** Mixed selections own one existing-coordinator maintenance credit and one COMMIT. */
export class PersonalCleanupAllocations {
  private readonly allocations: ContentWriteAllocations;
  private readonly capacity: AdaptiveContentCapacity;
  constructor(
    allocations: ContentWriteAllocations,
    capacity: AdaptiveContentCapacity,
  ) {
    this.allocations = allocations;
    this.capacity = capacity;
  }
  async prepare(client: pg.PoolClient, input: CleanupInput): Promise<void> {
    await validateSelection(client, input);
    const serialized = JSON.stringify(input.proof);
    const result = await client.query<{
      bytes: string | null;
      operation: string | null;
    }>(
      'SELECT bytes::text,operation::text FROM hash_talk.prepare_personal_cleanup($1,$2::jsonb,$3::jsonb,$4,$5::uuid[])',
      [
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
      scope: 'personal-clean',
      accountId: input.accountId,
      id: plan.operation,
      verify: async (owner) => {
        await owner.query(
          'SELECT hash_talk.assert_personal_cleanup_complete()',
        );
        await assertContentReclamationCapacity(owner, this.capacity);
      },
    });
  }
}
async function validateSelection(
  client: pg.PoolClient,
  input: CleanupInput,
): Promise<void> {
  const prior = await client.query<{ kind: string; id: string; hash: string }>(
    `SELECT r.kind,r.id,r.hash FROM hash_talk.personal_removals r
     JOIN jsonb_to_recordset($2::jsonb) s(kind text,id uuid) ON s.kind=r.kind AND s.id=r.id WHERE r.account_id=$1`,
    [input.accountId, JSON.stringify(input.items)],
  );
  const receipts = new Map(
    prior.rows.map((row) => [row.kind + ':' + row.id, row.hash]),
  );
  for (const item of input.items) {
    const hash = receipts.get(item.kind + ':' + item.id);
    if (hash !== undefined) {
      if (hash !== item.hash)
        throw new AccountError(409, 'Seleção de limpeza divergente.');
      continue;
    }
    await validateTarget(client, { input, item });
  }
}
async function validateTarget(
  client: pg.PoolClient,
  selection: { input: CleanupInput; item: BackupTarget },
): Promise<void> {
  const { input, item } = selection;
  if (item.kind === 'dm-message') {
    await input.validateSocial(client, input.accountId, item);
    return;
  }
  if (item.kind === 'vault') {
    const row = await client.query<{ hash: string }>(
      "SELECT hash FROM hash_talk.vault_operations WHERE account_id=$1 AND id=$2 AND state='accepted'",
      [input.accountId, item.id],
    );
    if (row.rows[0]?.hash !== item.hash)
      throw new AccountError(409, 'Versão do cofre ausente ou divergente.');
    return;
  }
  const row = await client.query<PersonalCleanupTarget>(
    'SELECT hash,sender,recipient,body IS NOT NULL AS available FROM hash_talk.message_packets WHERE id=$1',
    [item.id],
  );
  assertPersonalCleanupTarget(row.rows[0], {
    account: input.accountId,
    hash: item.hash,
  });
}
