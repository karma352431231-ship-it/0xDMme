import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import {
  communityBoolean,
  communityCursor,
  communityPageSize,
  communityRevision,
  communityText,
} from '../../shared/communities/index.ts';
import type { Sanction } from '../../shared/communities/index.ts';
import {
  activeSanction,
  bumpCommunity,
  communityRole,
  communityTarget,
  currentCommunity,
  requireCommunityManager,
} from './community-authority.ts';
import type { CommunityContext, SanctionRow } from './community-authority.ts';
import { communityStaff } from './community-governance.ts';
import { assertContentCapacity } from './vault-quota.ts';

const sanctionColumns =
  'id,target,actor,reason,days,until_at,lifted,appeal,decision';
interface ReportRow {
  id: string;
  community_id: string;
  author: string;
  reason: string;
  resolved: boolean;
  decision: string | null;
}
export async function sanctionView(
  context: CommunityContext,
  row: SanctionRow | null,
): Promise<Sanction | null> {
  if (!row) return null;
  const profile =
    (await context.profiles.identities(context.client, [row.target])).get(
      row.target,
    ) ?? null;
  return {
    id: row.id,
    target: profile,
    reason: row.reason,
    until: row.until_at?.toISOString() ?? null,
    lifted: row.lifted,
    appeal: row.appeal,
    decision: row.decision,
  };
}
function reportView(row: ReportRow) {
  return {
    id: row.id,
    reason: row.reason,
    resolved: row.resolved,
    decision: row.decision,
  };
}
async function sanctionRow(
  context: CommunityContext,
  id: string,
): Promise<SanctionRow> {
  const result = await context.client.query<SanctionRow>(
    `SELECT ${sanctionColumns} FROM hash_talk.community_sanctions WHERE community_id=$1 AND id=$2`,
    [context.row.id, id],
  );
  if (!result.rows[0]) throw new AccountError(404, 'Sanção indisponível.');
  return result.rows[0];
}
function sanctionDays(value: unknown): number | null {
  if (value !== null && value !== 1 && value !== 7 && value !== 30)
    throw new AccountError(
      400,
      'Escolha 1, 7, 30 dias ou banimento reversível.',
    );
  return value;
}
async function applySanction(
  context: CommunityContext,
  data: Record<string, unknown>,
  capacity: number,
): Promise<void> {
  keys(data, ['id', 'revision', 'record', 'target', 'reason', 'days']);
  await requireCommunityManager(context);
  const target = uuid(data['target']),
    id = uuid(data['record']),
    reason = communityText(data['reason'], 1000),
    days = sanctionDays(data['days']);
  const previous = await context.client.query<
    SanctionRow & { community_id: string }
  >(
    `SELECT ${sanctionColumns},community_id FROM hash_talk.community_sanctions WHERE id=$1`,
    [id],
  );
  const old = previous.rows[0];
  if (old) {
    if (
      old.community_id !== context.row.id ||
      old.target !== target ||
      old.actor !== context.actor.id ||
      old.reason !== reason ||
      old.days !== days
    )
      throw new AccountError(409, 'Identificador de sanção já utilizado.');
    return;
  }
  currentCommunity(context, communityRevision(data['revision']));
  await communityTarget(context, target);
  if (
    (await communityRole({
      ...context,
      actor: { ...context.actor, id: target },
    })) !== 'participant'
  )
    throw new AccountError(
      403,
      'Remova a função de gestão antes de aplicar uma sanção.',
    );
  if (await activeSanction(context, target))
    throw new AccountError(409, 'Já existe uma sanção ativa para este perfil.');
  await context.client.query(
    "INSERT INTO hash_talk.community_sanctions(id,community_id,target,actor,reason,days,until_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6::integer IS NULL THEN NULL ELSE now()+$6*interval '1 day' END)",
    [id, context.row.id, target, context.actor.id, reason, days],
  );
  await bumpCommunity(context);
  await assertContentCapacity(context.client, capacity);
}
async function appeal(
  context: CommunityContext,
  data: Record<string, unknown>,
  capacity: number,
): Promise<void> {
  keys(data, ['id', 'record', 'text']);
  const record = await sanctionRow(context, uuid(data['record'])),
    text = communityText(data['text'], 2000);
  if (record.target !== context.actor.id)
    throw new AccountError(403, 'Somente o perfil afetado pode contestar.');
  if (record.appeal === text) return;
  if (record.appeal !== null || record.lifted)
    throw new AccountError(409, 'Contestação já enviada ou sanção encerrada.');
  await context.client.query(
    'UPDATE hash_talk.community_sanctions SET appeal=$2 WHERE id=$1',
    [record.id, text],
  );
  await assertContentCapacity(context.client, capacity);
}
async function decide(
  context: CommunityContext,
  data: Record<string, unknown>,
  capacity: number,
): Promise<void> {
  keys(data, ['id', 'revision', 'record', 'decision', 'lift']);
  await requireCommunityManager(context);
  const record = await sanctionRow(context, uuid(data['record'])),
    decision = communityText(data['decision'], 1000),
    lift = communityBoolean(data['lift']);
  if (record.decision === decision && record.lifted === lift) return;
  currentCommunity(context, communityRevision(data['revision']));
  if (record.decision !== null && !lift)
    throw new AccountError(409, 'Contestação já revisada.');
  if (!record.appeal && !lift)
    throw new AccountError(400, 'Revise uma contestação ou retire a sanção.');
  if (record.lifted) throw new AccountError(409, 'Sanção já encerrada.');
  await context.client.query(
    'UPDATE hash_talk.community_sanctions SET decision=$2,lifted=$3 WHERE id=$1',
    [record.id, decision, lift],
  );
  await bumpCommunity(context);
  await assertContentCapacity(context.client, capacity);
}
async function reports(
  context: CommunityContext,
  data: Record<string, unknown>,
) {
  keys(data, ['id', 'after', 'own']);
  const own = communityBoolean(data['own']);
  if (!own) await requireCommunityManager(context);
  const result = await context.client.query<ReportRow>(
    'SELECT id,community_id,author,reason,resolved,decision FROM hash_talk.community_reports WHERE community_id=$1 AND ($2::uuid IS NULL OR id>$2) AND ($3::uuid IS NULL OR author=$3) ORDER BY id LIMIT $4',
    [
      context.row.id,
      communityCursor(data['after']),
      own ? context.actor.id : null,
      communityPageSize + 1,
    ],
  );
  const rows = result.rows.slice(0, communityPageSize);
  return {
    items: rows.map(reportView),
    next:
      result.rows.length > communityPageSize ? (rows.at(-1)?.id ?? null) : null,
  };
}
async function report(
  context: CommunityContext,
  data: Record<string, unknown>,
  capacity: number,
): Promise<void> {
  keys(data, ['id', 'record', 'reason']);
  const id = uuid(data['record']),
    reason = communityText(data['reason'], 1000);
  const previous = await context.client.query<ReportRow>(
    'SELECT id,community_id,author,reason,resolved,decision FROM hash_talk.community_reports WHERE id=$1',
    [id],
  );
  const old = previous.rows[0];
  if (old) {
    if (
      old.community_id !== context.row.id ||
      old.author !== context.actor.id ||
      old.reason !== reason
    )
      throw new AccountError(409, 'Identificador de denúncia já utilizado.');
    return;
  }
  const open = await context.client.query(
    'SELECT 1 FROM hash_talk.community_reports WHERE community_id=$1 AND author=$2 AND NOT resolved',
    [context.row.id, context.actor.id],
  );
  if (open.rowCount)
    throw new AccountError(
      409,
      'Você já tem uma denúncia aberta nesta comunidade. Acompanhe sua análise.',
    );
  await context.client.query(
    'INSERT INTO hash_talk.community_reports(id,community_id,author,reason) VALUES($1,$2,$3,$4)',
    [id, context.row.id, context.actor.id, reason],
  );
  await assertContentCapacity(context.client, capacity);
}
async function resolve(
  context: CommunityContext,
  data: Record<string, unknown>,
  capacity: number,
): Promise<void> {
  keys(data, ['id', 'revision', 'record', 'decision']);
  await requireCommunityManager(context);
  const result = await context.client.query<ReportRow>(
    'SELECT id,community_id,author,reason,resolved,decision FROM hash_talk.community_reports WHERE id=$1 AND community_id=$2',
    [uuid(data['record']), context.row.id],
  );
  const row = result.rows[0],
    decision = communityText(data['decision'], 1000);
  if (!row) throw new AccountError(404, 'Denúncia indisponível.');
  if (row.resolved && row.decision === decision) return;
  currentCommunity(context, communityRevision(data['revision']));
  if (row.resolved) throw new AccountError(409, 'Denúncia já encerrada.');
  await context.client.query(
    'UPDATE hash_talk.community_reports SET resolved=true,decision=$2 WHERE id=$1',
    [row.id, decision],
  );
  await bumpCommunity(context);
  await assertContentCapacity(context.client, capacity);
}
async function sanctions(
  context: CommunityContext,
  data: Record<string, unknown>,
) {
  keys(data, ['id', 'after']);
  const manager = (await communityRole(context)) !== 'participant';
  const result = await context.client.query<SanctionRow>(
    `SELECT ${sanctionColumns} FROM hash_talk.community_sanctions WHERE community_id=$1 AND ($2::uuid IS NULL OR id>$2) AND ($3::uuid IS NULL OR target=$3) ORDER BY id LIMIT $4`,
    [
      context.row.id,
      communityCursor(data['after']),
      manager ? null : context.actor.id,
      communityPageSize + 1,
    ],
  );
  const rows = result.rows.slice(0, communityPageSize),
    profiles = await context.profiles.identities(
      context.client,
      rows.map((row) => row.target),
    );
  return {
    items: rows.map((row) => ({
      id: row.id,
      target: profiles.get(row.target) ?? null,
      reason: row.reason,
      until: row.until_at?.toISOString() ?? null,
      lifted: row.lifted,
      appeal: row.appeal,
      decision: row.decision,
    })),
    next:
      result.rows.length > communityPageSize ? (rows.at(-1)?.id ?? null) : null,
  };
}
export async function communityModeration(
  context: CommunityContext,
  operation: string,
  data: Record<string, unknown>,
  capacity: number,
): Promise<unknown> {
  switch (operation) {
    case 'staff':
      return communityStaff(context, data);
    case 'sanctions':
      return sanctions(context, data);
    case 'reports':
      return reports(context, data);
    case 'sanction':
      await applySanction(context, data, capacity);
      return undefined;
    case 'appeal':
      await appeal(context, data, capacity);
      return undefined;
    case 'decide-sanction':
      await decide(context, data, capacity);
      return undefined;
    case 'report':
      await report(context, data, capacity);
      return undefined;
    case 'resolve-report':
      await resolve(context, data, capacity);
      return undefined;
    default:
      throw new AccountError(404, 'Operação da comunidade indisponível.');
  }
}
