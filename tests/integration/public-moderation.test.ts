import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import type {
  PublicModerationClaim,
  PublicModerationEvaluation,
  PublicModerationBinding,
} from '../../src/server/database/index.ts';
import { PublicModerationStore } from '../../src/server/database/public-moderation.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { publicModerationRetentionMs } from '../../src/shared/public-moderation/index.ts';

await test('fila global de análise: concorrência, atomicidade, retries, contestação e prazo fixo', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de teste necessário.');
  const db = new Database(config.databaseUrl),
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 2 });
  await db.migrate();
  const owner = crypto.randomUUID(),
    other = crypto.randomUUID(),
    owners = [owner, other];
  const model = { hash: 'b'.repeat(64), runtime: 'isolated-contract-test' };
  const bind: PublicModerationBinding = () =>
    Promise.resolve(() => Promise.resolve());
  t.after(async () => {
    await pool.query(
      'DELETE FROM hash_talk.public_moderation WHERE owner=ANY($1::uuid[])',
      [owners],
    );
    await pool.end();
    await db.close();
  });
  async function transaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
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
  async function enqueue(store = db.publicModeration): Promise<string> {
    return transaction((client) =>
      store.enqueue(client, {
        owner,
        target: crypto.randomUUID(),
        kind: 'post-media',
        contentHash: 'a'.repeat(64),
      }),
    );
  }
  async function usage(): Promise<number> {
    const result = await pool.query<{ bytes: string }>(
      'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
    );
    return Number(result.rows[0]!.bytes);
  }
  async function row(id: string) {
    const result = await pool.query<{
      status: string;
      attempts: number;
      created_at: Date;
      expires_at: Date;
      decision: string | null;
    }>(
      'SELECT status,attempts,created_at,expires_at,decision FROM hash_talk.public_moderation WHERE id=$1',
      [id],
    );
    return result.rows[0]!;
  }
  function evaluation(
    job: PublicModerationClaim,
    verdict: PublicModerationEvaluation['verdict'] = 'allow',
  ): PublicModerationEvaluation {
    return {
      contentHash: job.contentHash,
      modelHash: job.modelHash,
      frames: 1_800,
      expectedFrames: 1_800,
      verdict,
    };
  }
  const pending = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM hash_talk.public_moderation WHERE status IN ('pending','analyzing','failed') AND attempts<3 AND expires_at>now()",
  );
  assert.equal(
    pending.rows[0]!.count,
    '0',
    'Isolar a fila antes de testar; não consumir trabalho de outro autor.',
  );
  await t.test(
    'capacidade global cobre o registro; falta de capacidade reverte a admissão',
    async () => {
      const before = await usage();
      await assert.rejects(
        enqueue(new PublicModerationStore(pool, before + 1_023)),
        /Capacidade global/,
      );
      assert.equal(await usage(), before);
      const id = await enqueue();
      assert.equal(await usage(), before + 1_024);
      const saved = await row(id);
      assert.equal(
        saved.expires_at.getTime() - saved.created_at.getTime(),
        publicModerationRetentionMs,
      );
    },
  );
  await t.test(
    'uma concessão por trabalho; cobertura incompleta e falha de publicação não aprovam',
    async () => {
      const claimed = await Promise.all([
        db.publicModeration.claim(model),
        db.publicModeration.claim(model),
      ]);
      const jobs = claimed.filter((job) => job !== null);
      assert.equal(jobs.length, 1);
      const job = jobs[0]!;
      await assert.rejects(
        db.publicModeration.finish(
          job,
          { ...evaluation(job), frames: 1_799 },
          bind,
        ),
        /incompleta/,
      );
      await assert.rejects(
        db.publicModeration.finish(
          { ...job, target: other },
          evaluation(job),
          bind,
        ),
        /substituída/,
      );
      await assert.rejects(
        db.publicModeration.finish(job, evaluation(job), (client) =>
          Promise.resolve(async () => {
            await client.query(
              'UPDATE hash_talk.public_moderation SET decision=$2 WHERE id=$1',
              [job.id, 'Simulated target write'],
            );
            throw new Error('Simulated publication failure');
          }),
        ),
        /Simulated publication failure/,
      );
      assert.equal((await row(job.id)).status, 'analyzing');
      assert.equal((await row(job.id)).decision, null);
      await db.publicModeration.finish(job, evaluation(job), bind);
      assert.equal((await row(job.id)).status, 'approved');
      await db.publicModeration.finish(job, evaluation(job), () =>
        Promise.resolve(() =>
          Promise.reject(new Error('Repeated publication')),
        ),
      );
      await assert.rejects(
        db.publicModeration.finish(job, evaluation(job, 'reject'), bind),
        /substituída/,
      );
      await pool.query(
        "UPDATE hash_talk.public_moderation SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1",
        [job.id],
      );
      assert.deepEqual(await db.publicModeration.expired(), []);
    },
  );
  await t.test(
    'contestação é do autor, única e idempotente; revisão exige confirmação de conteúdo permitido',
    async () => {
      const id = await enqueue(),
        job = await db.publicModeration.claim(model);
      assert.ok(job);
      assert.equal(job.id, id);
      await db.publicModeration.finish(job, evaluation(job, 'hold'), bind);
      await assert.rejects(
        transaction((client) =>
          db.publicModeration.appeal(client, {
            owner: other,
            id,
            reason: 'Não sou autor',
          }),
        ),
        /indisponível/,
      );
      const request = {
        owner,
        id,
        reason: 'A imagem não contém conteúdo proibido.',
      };
      const appealed = await transaction((client) =>
        db.publicModeration.appeal(client, request),
      );
      const charged = await usage();
      assert.deepEqual(
        await transaction((client) =>
          db.publicModeration.appeal(client, request),
        ),
        appealed,
      );
      assert.equal(await usage(), charged);
      await assert.rejects(
        transaction((client) =>
          db.publicModeration.appeal(client, {
            ...request,
            reason: 'Trocar contestação',
          }),
        ),
        /já foi registrada/,
      );
      await assert.rejects(
        db.publicModeration.operatorReview(
          {
            id,
            verdict: 'allow',
            reason: 'Revisado',
            confirmsPermitted: false,
          },
          bind,
        ),
        /proibição global/,
      );
      const decision = {
        id,
        verdict: 'allow' as const,
        reason: 'Falso positivo, sem conteúdo proibido.',
        confirmsPermitted: true,
      };
      const resolved = await db.publicModeration.operatorReview(decision, bind);
      assert.equal(resolved.status, 'approved');
      assert.equal(resolved.appeal, request.reason);
      assert.deepEqual(
        await db.publicModeration.operatorReview(decision, () =>
          Promise.resolve(() =>
            Promise.reject(new Error('Repeated publication')),
          ),
        ),
        resolved,
      );
      await assert.rejects(
        db.publicModeration.operatorReview(
          { ...decision, verdict: 'reject' },
          bind,
        ),
        /já foi decidida/,
      );
      const foreign = await transaction((client) =>
        db.publicModeration.notices(client, other),
      );
      assert.deepEqual(foreign, []);
    },
  );
  await t.test(
    'publicação exige política e modelo/runtime aceitos; o registro aprovado sozinho não abre leitura',
    async () => {
      const id = await enqueue(),
        current = await db.publicModeration.claim(model);
      assert.ok(current);
      assert.equal(current.id, id);
      await db.publicModeration.finish(current, evaluation(current), bind);
      assert.equal((await db.publicModeration.released(pool, [id])).size, 0);
      const accepted = new PublicModerationStore(pool, 3_000_000_000, [model]);
      assert.equal(
        (await accepted.released(pool, [id])).get(id)?.contentHash,
        current.contentHash,
      );
      const otherRuntime = new PublicModerationStore(pool, 3_000_000_000, [
        { ...model, runtime: 'outro-runtime' },
      ]);
      assert.equal((await otherRuntime.released(pool, [id])).size, 0);
      await pool.query(
        "UPDATE hash_talk.public_moderation SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1",
        [id],
      );
      assert.equal(
        (await accepted.released(pool, [id])).size,
        1,
        'Prazo de candidato não expira aprovado.',
      );
      await transaction((client) => db.publicModeration.remove(client, id));
      assert.equal(
        (await accepted.released(pool, [id])).size,
        0,
        'Substituição/exclusão fecha a referência antiga.',
      );
    },
  );
  await t.test(
    'recuperação tem três tentativas; prazo não se renova e descarte precisa de confirmação',
    async () => {
      const id = await enqueue(),
        original = await row(id);
      for (const attempt of [1, 2]) {
        const job = await db.publicModeration.claim(model);
        assert.ok(job);
        assert.equal(job.id, id);
        assert.equal((await row(id)).attempts, attempt);
        await pool.query(
          "UPDATE hash_talk.public_moderation SET lease_until=now()-interval '1 second' WHERE id=$1",
          [id],
        );
        assert.equal(await db.publicModeration.recover(), 1);
        await assert.rejects(
          db.publicModeration.finish(job, evaluation(job), bind),
          /substituída/,
        );
      }
      const third = await db.publicModeration.claim(model);
      assert.ok(third);
      await db.publicModeration.fail(third);
      assert.equal(await db.publicModeration.claim(model), null);
      const exhausted = await row(id);
      assert.equal(exhausted.status, 'failed');
      assert.equal(exhausted.attempts, 3);
      assert.equal(
        exhausted.expires_at.getTime(),
        original.expires_at.getTime(),
      );
      await pool.query(
        "UPDATE hash_talk.public_moderation SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1",
        [id],
      );
      assert.equal((await db.publicModeration.expired())[0]?.id, id);
      assert.equal((await row(id)).status, 'discarding');
      assert.deepEqual(await db.publicModeration.expired(), []);
      assert.equal((await db.publicModeration.discarding())[0]?.id, id);
      await transaction((client) => db.publicModeration.collected(client, id));
      assert.equal((await row(id)).status, 'expired');
      assert.equal((await row(id)).attempts, 3);
    },
  );
});
