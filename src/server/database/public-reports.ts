import type pg from 'pg';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import { communityText } from '../../shared/communities/index.ts';
import { assertContentCapacity } from './vault-quota.ts';
/** Storage only. There is no automatic sanction, forwarding or action on the subject. */
export async function storePublicReport(
  context: { client: pg.PoolClient; actor: { id: string } },
  data: Record<string, unknown>,
  capacity: number,
) {
  keys(data, ['record', 'kind', 'target', 'reason']);
  const id = uuid(data['record']),
    target = uuid(data['target']),
    reason = communityText(data['reason'], 1000),
    kind = data['kind'];
  if (kind !== 'post' && kind !== 'profile')
    throw new AccountError(400, 'Tipo de denúncia inválido.');
  const previous = await context.client.query<{
    reporter: string;
    target: string;
    kind: string;
    reason: string;
  }>(
    'SELECT reporter,target,kind,reason FROM hash_talk.public_reports WHERE id=$1',
    [id],
  );
  const old = previous.rows[0];
  validateReportReplay(old, {
    reporter: context.actor.id,
    target,
    kind,
    reason,
  });
  if (old) return { saved: true };
  if (kind === 'profile' && target === context.actor.id)
    throw new AccountError(400, 'Escolha outro perfil para denunciar.');
  await requireReportTarget(context.client, { kind, target });
  await context.client.query(
    'INSERT INTO hash_talk.public_reports(id,reporter,target,kind,reason) VALUES($1,$2,$3,$4,$5)',
    [id, context.actor.id, target, kind, reason],
  );
  await assertContentCapacity(context.client, capacity);
  return { saved: true };
}
async function requireReportTarget(
  client: pg.PoolClient,
  input: { kind: 'post' | 'profile'; target: string },
): Promise<void> {
  const found =
    input.kind === 'post'
      ? await client.query(
          'SELECT 1 FROM hash_talk.community_posts WHERE id=$1 AND NOT deleted AND active_removal IS NULL',
          [input.target],
        )
      : await client.query(
          'SELECT 1 FROM hash_talk.public_profiles WHERE id=$1',
          [input.target],
        );
  if (!found.rowCount)
    throw new AccountError(404, 'Alvo da denúncia indisponível.');
}
function validateReportReplay(
  old:
    | { reporter: string; target: string; kind: string; reason: string }
    | undefined,
  expected: { reporter: string; target: string; kind: string; reason: string },
): void {
  if (!old) return;
  if (
    old.reporter !== expected.reporter ||
    old.target !== expected.target ||
    old.kind !== expected.kind ||
    old.reason !== expected.reason
  )
    throw new AccountError(409, 'Identificador de denúncia já usado.');
}
