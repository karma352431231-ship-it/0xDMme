import { BackupStore } from './backups.ts';
export type { BackupStore } from './backups.ts';
import { AttachmentStore } from './attachments.ts';
export type { AttachmentStore } from './attachments.ts';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { AuthenticationStore } from './authentication.ts';
import { DeviceStore } from './devices.ts';
import { VaultStore } from './vault.ts';
import { ContactStore } from './contacts.ts';
import { MessageRecoveryStore } from './message-recovery.ts';
import { MessageStore } from './messages.ts';
import { MatrixStore } from './matrix.ts';
export type { MatrixStore, MatrixUpload } from './matrix.ts';
export type { MessageStore, MessageSnapshot } from './messages.ts';
export type { MessageRecoveryStore } from './message-recovery.ts';
export type { ContactStore, ContactAuthority } from './contacts.ts';
export { walletHash } from './contacts.ts';
export type { VaultStore } from './vault.ts';
export type { DeviceStore, DeviceLink, DirectoryRow } from './devices.ts';
export type {
  AuthenticationStore,
  LoginChallenge,
  LoginHandoff,
} from './authentication.ts';

const migrations = [
  '001-foundation.sql',
  '002-accounts.sql',
  '003-wallet-ecosystems.sql',
  '004-devices.sql',
  '005-link-consumption.sql',
  '006-vault.sql',
  '007-used-capacity.sql',
  '008-content-usage.sql',
  '009-upload-expiry.sql',
  '010-contacts.sql',
  '011-contact-policy.sql',
  '012-message-recovery.sql',
  '013-messages.sql',
  '014-matrix-transport.sql',
  '015-message-kinds.sql',
  '016-attachments.sql',
  '017-personal-backup-cleanup.sql',
];

export interface MaintenanceSnapshot {
  estimatedLiveTuples: number;
  estimatedDeadTuples: number;
  tableBytes: number;
  indexBytes: number;
  vacuumRuns: number;
  analyzeRuns: number;
  oldestTransactionSeconds: number;
  xidAge: number;
  vacuumInProgress: number;
  blocksRead: number;
  blocksHit: number;
  walBytesSinceReset: number;
  commits: number;
  rollbacks: number;
  poolConnections: number;
  poolIdle: number;
  poolWaiting: number;
}

/** Owns its schema. Other modules must use operations rather than its tables. */
export class Database {
  private readonly pool: pg.Pool;
  private failed = false;
  readonly authentication: AuthenticationStore;
  readonly devices: DeviceStore;
  readonly vault: VaultStore;
  readonly contacts: ContactStore;
  readonly messageRecovery: MessageRecoveryStore;
  readonly messages: MessageStore;
  readonly matrix: MatrixStore;
  readonly attachments: AttachmentStore;
  readonly backups: BackupStore;

  constructor(connectionString: string, contentCapacity = 3_000_000_000) {
    this.pool = new pg.Pool({
      connectionString,
      max: 4,
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 10_000,
      query_timeout: 5_000,
      statement_timeout: 4_000,
      lock_timeout: 1_000,
      idle_in_transaction_session_timeout: 2_000,
      application_name: 'hash-talk',
      // Allow exit after explicit end; do not hide failures of a live service.
    });
    this.pool.on('error', () => {
      this.failed = true;
    });
    this.authentication = new AuthenticationStore(this.pool, contentCapacity);
    this.devices = new DeviceStore(this.pool, contentCapacity);
    this.vault = new VaultStore(this.pool, contentCapacity);
    this.contacts = new ContactStore(this.pool);
    this.messageRecovery = new MessageRecoveryStore(
      this.contacts,
      contentCapacity,
    );
    this.attachments = new AttachmentStore(
      this.pool,
      this.contacts,
      contentCapacity,
    );
    this.messages = new MessageStore(
      this.contacts,
      contentCapacity,
      this.attachments,
    );
    this.backups = new BackupStore(this.pool, this.contacts, contentCapacity);
    this.matrix = new MatrixStore(this.contacts, contentCapacity);
  }

  async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('hash-talk:migrations'))",
      );
      await client.query('CREATE SCHEMA IF NOT EXISTS hash_talk');
      await client.query(`CREATE TABLE IF NOT EXISTS hash_talk.schema_migrations (
        version integer PRIMARY KEY, checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      for (const [offset, filename] of migrations.entries()) {
        const version = offset + 1;
        const sql = await readFile(
          new URL(`./migrations/${filename}`, import.meta.url),
          'utf8',
        );
        const checksum = createHash('sha256').update(sql).digest('hex');
        const existing = await client.query<{ checksum: string }>(
          'SELECT checksum FROM hash_talk.schema_migrations WHERE version = $1',
          [version],
        );
        if (existing.rows.length === 0) {
          await client.query(sql);
          await client.query(
            'INSERT INTO hash_talk.schema_migrations (version, checksum) VALUES ($1, $2)',
            [version, checksum],
          );
        } else if (existing.rows[0]?.checksum !== checksum) {
          throw new Error('Migração aplicada difere da versão local.');
        }
      }
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async healthy(): Promise<boolean> {
    if (this.failed) return false;
    try {
      const result = await this.pool.query<{ healthy: boolean }>(
        `SELECT count(*) = 1 AS healthy FROM hash_talk.service_metadata`,
      );
      return result.rows[0]?.healthy === true;
    } catch {
      return false;
    }
  }

  /** Startup/persistence invariant; never returned in public health responses. */
  async installationIdentity(): Promise<string> {
    const result = await this.pool.query<{ installation_id: string }>(
      'SELECT installation_id FROM hash_talk.service_metadata WHERE singleton = true',
    );
    const identity = result.rows[0]?.installation_id;
    if (!identity) throw new Error('Estado persistente ausente.');
    return identity;
  }

  /** Aggregate metadata only; no SQL text, account rows, IPs or identifiers. */
  async maintenanceSnapshot(): Promise<MaintenanceSnapshot> {
    const result = await this.pool.query<
      Omit<MaintenanceSnapshot, 'poolConnections' | 'poolIdle' | 'poolWaiting'>
    >(`
      SELECT
        coalesce(sum(n_live_tup), 0)::float8 AS "estimatedLiveTuples",
        coalesce(sum(n_dead_tup), 0)::float8 AS "estimatedDeadTuples",
        coalesce(sum(pg_table_size(relid)), 0)::float8 AS "tableBytes",
        coalesce(sum(pg_indexes_size(relid)), 0)::float8 AS "indexBytes",
        coalesce(sum(vacuum_count + autovacuum_count), 0)::float8 AS "vacuumRuns",
        coalesce(sum(analyze_count + autoanalyze_count), 0)::float8 AS "analyzeRuns",
        (SELECT coalesce(max(extract(epoch FROM now() - xact_start)), 0)::float8
         FROM pg_stat_activity WHERE datname = current_database()
         AND pid <> pg_backend_pid() AND backend_type = 'client backend') AS "oldestTransactionSeconds",
        (SELECT age(datfrozenxid)::float8 FROM pg_database
         WHERE datname = current_database()) AS "xidAge",
        (SELECT count(*)::float8 FROM pg_stat_progress_vacuum
         WHERE datid = (SELECT oid FROM pg_database WHERE datname = current_database())) AS "vacuumInProgress",
        (SELECT blks_read::float8 FROM pg_stat_database
         WHERE datname = current_database()) AS "blocksRead",
        (SELECT blks_hit::float8 FROM pg_stat_database
         WHERE datname = current_database()) AS "blocksHit",
        (SELECT wal_bytes::float8 FROM pg_stat_wal) AS "walBytesSinceReset",
        (SELECT xact_commit::float8 FROM pg_stat_database
         WHERE datname = current_database()) AS "commits",
        (SELECT xact_rollback::float8 FROM pg_stat_database
         WHERE datname = current_database()) AS "rollbacks"
      FROM pg_stat_user_tables WHERE schemaname = 'hash_talk'
    `);
    const snapshot = result.rows[0];
    if (
      !snapshot ||
      Object.values(snapshot).some((value) => !Number.isFinite(value))
    )
      throw new Error('Métricas indisponíveis.');
    return {
      ...snapshot,
      poolConnections: this.pool.totalCount,
      poolIdle: this.pool.idleCount,
      poolWaiting: this.pool.waitingCount,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
