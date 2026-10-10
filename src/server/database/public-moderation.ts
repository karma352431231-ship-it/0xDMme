import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AccountError, boundedText, uuid } from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import {
  publicModerationKind,
  publicModerationPolicy,
} from '../../shared/public-moderation/index.ts';
import type {
  PublicModerationKind,
  PublicModerationNotice,
  PublicModerationStatus,
  PublicModerationPolicyVersion,
} from '../../shared/public-moderation/index.ts';
import { assertContentCapacity } from './vault-quota.ts';

export interface PublicModerationSubject {
  id: string;
  owner: string;
  kind: PublicModerationKind;
  target: string;
  contentHash: string;
  policy: PublicModerationPolicyVersion;
}
/** Internal acceptance is supplied by reviewed server code, never an upload or HTTP flag. */
export interface PublicModerationAcceptedModel {
  hash: string;
  runtime: string;
}
export interface PublicModerationClaim extends PublicModerationSubject {
  lease: string;
  modelHash: string;
  runtime: string;
}
export interface PublicModerationEvaluation {
  verdict: 'allow' | 'reject' | 'hold';
  contentHash: string;
  modelHash: string;
  frames: number;
  expectedFrames: number;
}
/** Lock the target first, then validate the lease, then apply only to those exact bytes.
 * The callback performs DB work only. Inference/filesystem waits are outside this transaction. */
export type PublicModerationBinding = (
  client: pg.PoolClient,
  subject: PublicModerationSubject,
) => Promise<((verdict: 'allow' | 'reject' | 'hold') => Promise<void>) | null>;
export type PublicModerationCollection = (
  client: pg.PoolClient,
  subject: PublicModerationSubject,
) => Promise<(() => Promise<void>) | null>;
export type PublicModerationRetargeting = (
  client: pg.PoolClient,
  subject: PublicModerationSubject,
) => Promise<((review: string) => Promise<void>) | null>;
interface ReviewRow {
  id: string;
  owner: string;
  kind: PublicModerationKind;
  target: string;
  content_hash: string;
  policy: PublicModerationPolicyVersion;
  status: PublicModerationStatus;
  created_at: Date;
  expires_at: Date;
  lease: string | null;
  model_hash: string | null;
  runtime: string | null;
  appeal: string | null;
  decision: string | null;
  automatic_verdict: PublicModerationEvaluation['verdict'] | null;
  completed_lease: string | null;
  frames: number | null;
  operator_verdict: 'allow' | 'reject' | null;
}
function sameClaim(row: ReviewRow, job: PublicModerationClaim): boolean {
  return (
    row.owner === job.owner &&
    row.kind === job.kind &&
    row.target === job.target &&
    row.content_hash === job.contentHash &&
    row.policy === job.policy &&
    row.model_hash === job.modelHash &&
    row.runtime === job.runtime
  );
}
function notice(row: ReviewRow): PublicModerationNotice {
  return {
    id: row.id,
    kind: row.kind,
    target: row.target,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    appeal: row.appeal,
    decision: row.decision,
  };
}
function subject(row: ReviewRow): PublicModerationSubject {
  return {
    id: row.id,
    owner: row.owner,
    kind: row.kind,
    target: row.target,
    contentHash: row.content_hash,
    policy: row.policy,
  };
}
function claim(row: ReviewRow): PublicModerationClaim {
  if (!row.lease || !row.model_hash || !row.runtime)
    throw new Error('Concessão de análise incompleta.');
  return {
    ...subject(row),
    lease: row.lease,
    modelHash: row.model_hash,
    runtime: row.runtime,
  };
}
function requireOperatorReview(row: ReviewRow, bound: boolean): void {
  if (row.operator_verdict !== null)
    throw new AccountError(409, 'Esta contestação já foi decidida.');
  if (
    row.policy !== publicModerationPolicy ||
    !bound ||
    !row.appeal ||
    !['held', 'rejected', 'failed'].includes(row.status) ||
    row.expires_at.getTime() <= Date.now()
  )
    throw new AccountError(
      409,
      'Contestação substituída, indisponível ou expirada.',
    );
}
export function validateModerationEvaluation(
  job: PublicModerationClaim,
  result: PublicModerationEvaluation,
): void {
  if (
    result.contentHash !== job.contentHash ||
    result.modelHash !== job.modelHash
  )
    throw new AccountError(
      409,
      'Resultado de análise pertence a outro conteúdo ou modelo.',
    );
  if (!['allow', 'reject', 'hold'].includes(result.verdict))
    throw new AccountError(422, 'Decisão de análise inválida.');
  if (
    !Number.isInteger(result.frames) ||
    result.frames < 1 ||
    result.frames > 60_001 ||
    result.frames !== result.expectedFrames
  )
    throw new AccountError(422, 'Cobertura de análise incompleta.');
}
/** One global durable queue; no community/person quota and no per-minute rate cap. */
export class PublicModerationStore {
  private readonly pool: pg.Pool;
  private readonly capacity: number;
  private readonly acceptedModels: readonly PublicModerationAcceptedModel[];
  constructor(
    pool: pg.Pool,
    capacity: number,
    acceptedModels: readonly PublicModerationAcceptedModel[] = [],
  ) {
    this.pool = pool;
    this.capacity = capacity;
    if (acceptedModels.length > 16)
      throw new Error('Inventário de modelos aceitos excedido.');
    this.acceptedModels = acceptedModels.map((model) => ({
      hash: fingerprint(model.hash),
      runtime: boundedText(model.runtime, 120),
    }));
  }
  /** Public projections and downloads share this gate; no accepted scanner means no release.
   * A released subject still needs the byte owner's current target/hash binding. */
  async released(
    client: Pick<pg.PoolClient, 'query'>,
    ids: string[],
  ): Promise<Map<string, PublicModerationSubject>> {
    if (ids.length > 256)
      throw new AccountError(400, 'Página de mídia excedida.');
    if (!ids.length || !this.acceptedModels.length) return new Map();
    const found = await client.query<ReviewRow>(
      `SELECT r.* FROM hash_talk.public_moderation r WHERE r.id=ANY($1::uuid[])
        AND r.status='approved' AND r.policy=ANY($2::text[]) AND
        (r.operator_verdict='allow' OR EXISTS(
          SELECT 1 FROM jsonb_to_recordset($3::jsonb) AS accepted(hash text,runtime text)
          WHERE accepted.hash=r.model_hash AND accepted.runtime=r.runtime))`,
      [
        ids.map(uuid),
        ['0xdmme-public-explicit-v1', publicModerationPolicy],
        JSON.stringify(this.acceptedModels),
      ],
    );
    return new Map(found.rows.map((row) => [row.id, subject(row)]));
  }
  private async transaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  /** Caller owns the target transaction; admission and its review commit atomically. */
  async enqueue(
    client: pg.PoolClient,
    input: {
      owner: string;
      kind: PublicModerationKind;
      target: string;
      contentHash: string;
      createdAt?: Date;
    },
    persist?: (review: string) => Promise<void>,
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      "INSERT INTO hash_talk.public_moderation(id,owner,kind,target,content_hash,policy,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz,now()),coalesce($7::timestamptz,now())+interval '7 days')",
      [
        id,
        uuid(input.owner),
        publicModerationKind(input.kind),
        uuid(input.target),
        fingerprint(input.contentHash),
        publicModerationPolicy,
        input.createdAt?.toISOString() ?? null,
      ],
    );
    // Charge the target's net change before checking its coordinated admission.
    if (persist) await persist(id);
    await assertContentCapacity(client, this.capacity);
    return id;
  }
  /** Superseding bytes never rewrites the historical model/appeal decision. */
  async remove(client: pg.PoolClient, id: string): Promise<void> {
    await client.query(
      "UPDATE hash_talk.public_moderation SET status='removed',lease=NULL,lease_until=NULL,next_attempt_at=NULL WHERE id=$1 AND status<>'removed'",
      [uuid(id)],
    );
  }
  /** A byte owner's temporary deadline may precede the global seven-day maximum. */
  async discard(client: pg.PoolClient, id: string): Promise<void> {
    await client.query(
      "UPDATE hash_talk.public_moderation SET status=CASE WHEN status='approved' THEN 'removed' ELSE 'discarding' END,lease=NULL,lease_until=NULL,next_attempt_at=NULL WHERE id=$1 AND status NOT IN ('removed','expired','discarding')",
      [uuid(id)],
    );
  }
  async claim(model: {
    hash: string;
    runtime: string;
  }): Promise<PublicModerationClaim | null> {
    const modelHash = fingerprint(model.hash),
      runtime = boundedText(model.runtime, 120);
    // Each admission owns one attempt. SKIP LOCKED permits other workers without double ownership.
    const result = await this.pool.query<ReviewRow>(
      `WITH candidate AS (
        SELECT id FROM hash_talk.public_moderation
        WHERE status IN ('pending','failed') AND attempts<3 AND expires_at>now() AND policy=$4
          AND (next_attempt_at IS NULL OR next_attempt_at<=now())
        ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED
      ) UPDATE hash_talk.public_moderation SET status='analyzing',attempts=attempts+1,
        lease=$1,lease_until=now()+interval '10 minutes',model_hash=$2,runtime=$3,next_attempt_at=NULL
        WHERE id IN(SELECT id FROM candidate) RETURNING *`,
      [randomUUID(), modelHash, runtime, publicModerationPolicy],
    );
    return result.rows[0] ? claim(result.rows[0]) : null;
  }
  async finish(
    job: PublicModerationClaim,
    result: PublicModerationEvaluation,
    bind: PublicModerationBinding,
  ): Promise<void> {
    validateModerationEvaluation(job, result);
    await this.transaction(async (client) => {
      const apply = await bind(client, job);
      const found = await client.query<ReviewRow & { live: boolean }>(
        "SELECT *,status='analyzing' AND lease=$2 AND lease_until>now() AND expires_at>now() AS live FROM hash_talk.public_moderation WHERE id=$1 FOR UPDATE",
        [job.id, job.lease],
      );
      const current = found.rows[0];
      if (!current || !sameClaim(current, job))
        throw new AccountError(
          409,
          'Análise substituída, interrompida ou expirada.',
        );
      if (
        current.completed_lease === job.lease &&
        current.automatic_verdict === result.verdict &&
        current.frames === result.frames
      )
        return;
      if (!current.live)
        throw new AccountError(
          409,
          'Análise substituída, interrompida ou expirada.',
        );
      if (apply) await apply(result.verdict);
      const status = apply
        ? { allow: 'approved', reject: 'rejected', hold: 'held' }[
            result.verdict
          ]
        : 'removed';
      await client.query(
        'UPDATE hash_talk.public_moderation SET status=$2,frames=$3,automatic_verdict=$4,completed_lease=lease,lease=NULL,lease_until=NULL WHERE id=$1',
        [job.id, status, result.frames, result.verdict],
      );
    });
  }
  async fail(job: PublicModerationClaim): Promise<void> {
    await this.pool.query(
      "UPDATE hash_talk.public_moderation SET status='failed',lease=NULL,lease_until=NULL,next_attempt_at=CASE WHEN attempts<3 THEN now()+interval '1 minute' ELSE NULL END WHERE id=$1 AND status='analyzing' AND lease=$2",
      [job.id, job.lease],
    );
  }
  /** Bounded recovery never extends the original seven-day candidate deadline. */
  async recover(): Promise<number> {
    const result = await this.pool.query(
      `WITH interrupted AS (SELECT id FROM hash_talk.public_moderation
        WHERE status='analyzing' AND lease_until<=now() ORDER BY lease_until,id LIMIT 32 FOR UPDATE SKIP LOCKED)
      UPDATE hash_talk.public_moderation SET status='failed',lease=NULL,lease_until=NULL,
        next_attempt_at=CASE WHEN attempts<3 THEN now() ELSE NULL END WHERE id IN(SELECT id FROM interrupted)`,
    );
    return result.rowCount ?? 0;
  }
  /** Rule updates preserve history and the original byte deadline, not a new seven-day window. */
  async upgrade(bind: PublicModerationRetargeting): Promise<number> {
    const found = await this.pool.query<ReviewRow>(
      "SELECT * FROM hash_talk.public_moderation WHERE policy<>$1 AND expires_at>now() AND status IN ('pending','analyzing','held','rejected','failed') ORDER BY created_at,id LIMIT 32",
      [publicModerationPolicy],
    );
    for (const initial of found.rows)
      await this.transaction(async (client) => {
        const retarget = await bind(client, subject(initial));
        const locked = await client.query<ReviewRow>(
          'SELECT * FROM hash_talk.public_moderation WHERE id=$1 FOR UPDATE',
          [initial.id],
        );
        const row = locked.rows[0];
        if (
          !row ||
          row.policy === publicModerationPolicy ||
          !['pending', 'analyzing', 'held', 'rejected', 'failed'].includes(
            row.status,
          ) ||
          row.expires_at.getTime() <= Date.now()
        )
          return;
        if (retarget)
          await this.enqueue(
            client,
            {
              owner: row.owner,
              kind: row.kind,
              target: row.target,
              contentHash: row.content_hash,
              createdAt: row.created_at,
            },
            retarget,
          );
        await this.remove(client, row.id);
      });
    return found.rows.length;
  }
  /** Close byte access at the deadline even while physical collection is unavailable. */
  async retained(
    client: Pick<pg.PoolClient, 'query'>,
    id: string,
  ): Promise<boolean> {
    const result = await client.query(
      "SELECT 1 FROM hash_talk.public_moderation WHERE id=$1 AND (status='approved' OR (expires_at>now() AND status NOT IN ('discarding','removed','expired')))",
      [uuid(id)],
    );
    return Boolean(result.rowCount);
  }
  /** Authenticate the public owner in the calling module's transaction. */
  async notices(
    client: pg.PoolClient,
    owner: string,
    after: string | null = null,
  ): Promise<PublicModerationNotice[]> {
    const result = await client.query<ReviewRow>(
      `SELECT * FROM hash_talk.public_moderation WHERE owner=$1
        AND ($2::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM hash_talk.public_moderation WHERE id=$2 AND owner=$1))
        ORDER BY created_at DESC,id DESC LIMIT 32`,
      [uuid(owner), after ? uuid(after) : null],
    );
    return result.rows.map(notice);
  }
  async appeal(
    client: pg.PoolClient,
    input: { owner: string; id: string; reason: string },
  ): Promise<PublicModerationNotice> {
    const id = uuid(input.id),
      owner = uuid(input.owner),
      reason = boundedText(input.reason, 2_000);
    const current = await client.query<ReviewRow>(
      'SELECT * FROM hash_talk.public_moderation WHERE id=$1 AND owner=$2 FOR UPDATE',
      [id, owner],
    );
    const row = current.rows[0];
    if (!row) throw new AccountError(404, 'Análise indisponível.');
    if (row.appeal === reason) return notice(row);
    if (row.appeal !== null)
      throw new AccountError(409, 'A contestação já foi registrada.');
    if (
      !['rejected', 'held', 'failed'].includes(row.status) ||
      row.expires_at.getTime() <= Date.now()
    )
      throw new AccountError(409, 'Esta análise não aceita contestação.');
    const saved = await client.query<ReviewRow>(
      'UPDATE hash_talk.public_moderation SET appeal=$2 WHERE id=$1 RETURNING *',
      [id, reason],
    );
    await assertContentCapacity(client, this.capacity);
    return notice(saved.rows[0]!);
  }
  /** Claim bytes for deletion, keeping their owner's capacity until its collector succeeds. */
  async expired(
    kind: PublicModerationKind | null = null,
  ): Promise<PublicModerationNotice[]> {
    const result = await this.pool.query<ReviewRow>(
      `WITH expired AS (SELECT id FROM hash_talk.public_moderation
        WHERE expires_at<=now() AND status NOT IN ('approved','expired','removed','discarding')
          AND ($1::text IS NULL OR kind=$1)
        ORDER BY expires_at,id LIMIT 32 FOR UPDATE SKIP LOCKED)
      UPDATE hash_talk.public_moderation SET status='discarding',lease=NULL,lease_until=NULL,next_attempt_at=NULL
        WHERE id IN(SELECT id FROM expired) RETURNING *`,
      [kind],
    );
    return result.rows.map(notice);
  }
  async discarding(
    kind: PublicModerationKind | null = null,
  ): Promise<PublicModerationNotice[]> {
    const result = await this.pool.query<ReviewRow>(
      "SELECT * FROM hash_talk.public_moderation WHERE status='discarding' AND ($1::text IS NULL OR kind=$1) ORDER BY expires_at,id LIMIT 32",
      [kind],
    );
    return result.rows.map(notice);
  }
  async nextCollection(
    kind: 'avatar' | 'profile-banner' | 'community-photo',
  ): Promise<number | null> {
    const result = await this.pool.query<{ at: Date | null }>(
      "SELECT min(CASE WHEN status='discarding' THEN clock_timestamp() ELSE expires_at END) AS at FROM hash_talk.public_moderation WHERE kind=$1 AND status NOT IN ('approved','expired','removed')",
      [kind],
    );
    return result.rows[0]?.at?.getTime() ?? null;
  }
  async nextWork(analyze: boolean): Promise<number | null> {
    const result = await this.pool.query<{ at: Date | null }>(
      `SELECT min(CASE WHEN status='analyzing' THEN lease_until
       WHEN $1 AND status IN ('pending','failed') AND attempts<3 AND expires_at>now()
       THEN coalesce(next_attempt_at,clock_timestamp()) ELSE NULL END) AS at
       FROM hash_talk.public_moderation`,
      [analyze],
    );
    return result.rows[0]?.at?.getTime() ?? null;
  }
  /** Caller confirms physical deletion; no media ledger is released by this record alone. */
  async collected(client: pg.PoolClient, id: string): Promise<void> {
    await client.query(
      "UPDATE hash_talk.public_moderation SET status='expired' WHERE id=$1 AND status='discarding'",
      [uuid(id)],
    );
  }
  /** Database bytes and their completed expiry notice commit together. */
  async collect(id: string, bind: PublicModerationCollection): Promise<void> {
    await this.transaction(async (client) => {
      const initial = await client.query<ReviewRow>(
        'SELECT * FROM hash_talk.public_moderation WHERE id=$1',
        [uuid(id)],
      );
      const row = initial.rows[0];
      if (!row) return;
      const remove = await bind(client, subject(row));
      const locked = await client.query<ReviewRow>(
        'SELECT * FROM hash_talk.public_moderation WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (locked.rows[0]?.status !== 'discarding') return;
      if (remove) await remove();
      await this.collected(client, id);
    });
  }
  /** Only a restricted operator tool may call this; never expose it to social roles/HTTP. */
  async operatorReview(
    input: {
      id: string;
      verdict: 'allow' | 'reject';
      reason: string;
      confirmsPermitted: boolean;
    },
    bind: PublicModerationBinding,
  ): Promise<PublicModerationNotice> {
    const id = uuid(input.id),
      reason = boundedText(input.reason, 1_000);
    if (
      !['allow', 'reject'].includes(input.verdict) ||
      (input.verdict === 'allow' && input.confirmsPermitted !== true)
    )
      throw new AccountError(
        400,
        'A revisão deve preservar a proibição global de conteúdo explícito.',
      );
    return this.transaction(async (client) => {
      const initial = await client.query<ReviewRow>(
        'SELECT * FROM hash_talk.public_moderation WHERE id=$1',
        [id],
      );
      const row = initial.rows[0];
      if (!row) throw new AccountError(404, 'Análise indisponível.');
      const apply = await bind(client, subject(row));
      const locked = await client.query<ReviewRow>(
        'SELECT * FROM hash_talk.public_moderation WHERE id=$1 FOR UPDATE',
        [id],
      );
      const current = locked.rows[0]!;
      if (
        current.operator_verdict === input.verdict &&
        current.decision === reason
      )
        return notice(current);
      requireOperatorReview(current, apply !== null);
      if (!apply) throw new Error('Vínculo de análise ausente.');
      await apply(input.verdict);
      const saved = await client.query<ReviewRow>(
        'UPDATE hash_talk.public_moderation SET status=$2,operator_verdict=$3,decision=$4,reviewed_at=now() WHERE id=$1 RETURNING *',
        [
          id,
          input.verdict === 'allow' ? 'approved' : 'rejected',
          input.verdict,
          reason,
        ],
      );
      await assertContentCapacity(client, this.capacity);
      return notice(saved.rows[0]!);
    });
  }
  /** Internal operator inventory contains public IDs, never account/device or original upload data. */
  async operatorPage(after: string | null): Promise<PublicModerationNotice[]> {
    const rows = await this.pool.query<ReviewRow>(
      `SELECT * FROM hash_talk.public_moderation WHERE appeal IS NOT NULL AND operator_verdict IS NULL
        AND status IN ('held','rejected','failed') AND expires_at>now() AND policy=$2
        AND ($1::uuid IS NULL OR (created_at,id)>(SELECT created_at,id FROM hash_talk.public_moderation WHERE id=$1))
        ORDER BY created_at,id LIMIT 32`,
      [after ? uuid(after) : null, publicModerationPolicy],
    );
    return rows.rows.map(notice);
  }
  async operatorCandidate(id: string): Promise<{
    subject: PublicModerationSubject;
    notice: PublicModerationNotice;
  } | null> {
    const found = await this.pool.query<ReviewRow>(
      "SELECT * FROM hash_talk.public_moderation WHERE id=$1 AND appeal IS NOT NULL AND operator_verdict IS NULL AND status IN ('held','rejected','failed') AND expires_at>now() AND policy=$2",
      [uuid(id), publicModerationPolicy],
    );
    const row = found.rows[0];
    return row ? { subject: subject(row), notice: notice(row) } : null;
  }
}
