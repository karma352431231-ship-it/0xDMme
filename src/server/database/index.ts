import { GroupDailyStore } from './group-daily.ts';
export type { GroupDailyStore } from './group-daily.ts';
import { BackupStore } from './backups.ts';
import { DailyStore } from './daily.ts';
import { CallStore } from './calls.ts';
export type { CallStore, CallGate } from './calls.ts';
import { RepresentativeStore } from './representatives.ts';
export type {
  RepresentativeStore,
  CredentialReceipt,
  DomainRow,
} from './representatives.ts';
export type { DailyStore, PushJob } from './daily.ts';
export type { BackupStore } from './backups.ts';
import { AttachmentStore } from './attachments.ts';
export type { AttachmentStore } from './attachments.ts';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { DatabaseChanges } from './changes.ts';
export { DatabaseChanges };
export type { CommittedChange } from './changes.ts';
import { AuthenticationStore } from './authentication.ts';
import { PublicProfileStore } from './public-profile.ts';
export type { PublicProfileStore } from './public-profile.ts';
import { CommunityStore } from './communities.ts';
export type { CommunityStore } from './communities.ts';
import { CommunityPostStore } from './community-posts.ts';
import { CommunityMediaStore } from './community-media.ts';
export type { CommunityMediaStore } from './community-media.ts';
export type { CommunityPostStore } from './community-posts.ts';
import { CommunityDiscoveryStore } from './community-discovery.ts';
export type { CommunityDiscoveryStore } from './community-discovery.ts';
import { SocialDmStore } from './social-dm.ts';
import { SocialCryptoStore } from './social-crypto.ts';
import { SocialMatrixStore } from './social-matrix.ts';
import { SocialHistoryStore } from './social-history.ts';
import { SocialMediaStore } from './social-media.ts';
export type { SocialHistoryStore, SocialSnapshot } from './social-history.ts';
export type { SocialMediaStore } from './social-media.ts';
export type { SocialDmStore, SocialContext } from './social-dm.ts';
export type { SocialCryptoStore } from './social-crypto.ts';
export type { SocialMatrixStore } from './social-matrix.ts';
import { DeviceStore } from './devices.ts';
import { VaultStore } from './vault.ts';
import { ContactStore } from './contacts.ts';
import { MessageRecoveryStore } from './message-recovery.ts';
import { MessageStore } from './messages.ts';
import { MatrixStore } from './matrix.ts';
import { GroupStore } from './groups.ts';
import { GroupMessageStore } from './group-messages.ts';
import { GroupMediaStore } from './group-media.ts';
import { GroupRetentionStore } from './group-retention.ts';
import { StatusStore } from './status.ts';
import { StatusMediaStore } from './status-media.ts';
export type { StatusStore, StatusRow } from './status.ts';
export type { StatusMediaStore } from './status-media.ts';
export type { GroupMediaStore, GroupScope } from './group-media.ts';
export type { GroupRetentionStore } from './group-retention.ts';
export type { GroupMessageStore } from './group-messages.ts';
export type { GroupStore } from './groups.ts';
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
  '018-daily.sql',
  '019-linked-sessions.sql',
  '020-groups-status.sql',
  '021-group-delivery.sql',
  '022-group-media.sql',
  '023-status.sql',
  '024-group-interface.sql',
  '025-representatives.sql',
  '026-call-preference.sql',
  '027-push-controls.sql',
  '028-public-profiles.sql',
  '029-communities.sql',
  '030-community-posts.sql',
  '031-community-interactions.sql',
  '032-community-discovery.sql',
  '033-social-dm.sql',
  '034-social-dm-retention.sql',
  '035-social-block-revisions.sql',
  '036-social-history-media.sql',
  '037-community-media.sql',
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
  readonly calls: CallStore;
  private readonly pool: pg.Pool;
  private failed = false;
  readonly changes = new DatabaseChanges();
  readonly authentication: AuthenticationStore;
  readonly publicProfiles: PublicProfileStore;
  readonly communities: CommunityStore;
  readonly communityPosts: CommunityPostStore;
  readonly communityMedia: CommunityMediaStore;
  readonly communityDiscovery: CommunityDiscoveryStore;
  readonly socialDm: SocialDmStore;
  readonly socialCrypto: SocialCryptoStore;
  readonly socialMatrix: SocialMatrixStore;
  readonly socialHistory: SocialHistoryStore;
  readonly socialMedia: SocialMediaStore;
  readonly devices: DeviceStore;
  readonly vault: VaultStore;
  readonly contacts: ContactStore;
  readonly messageRecovery: MessageRecoveryStore;
  readonly messages: MessageStore;
  readonly matrix: MatrixStore;
  readonly attachments: AttachmentStore;
  readonly backups: BackupStore;
  readonly daily: DailyStore;
  readonly groups: GroupStore;
  readonly groupDaily: GroupDailyStore;
  readonly groupMessages: GroupMessageStore;
  readonly groupMedia: GroupMediaStore;
  readonly groupRetention: GroupRetentionStore;
  readonly statuses: StatusStore;
  readonly statusMedia: StatusMediaStore;
  readonly representatives: RepresentativeStore;

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
    this.authentication = new AuthenticationStore(
      this.pool,
      contentCapacity,
      this.changes,
    );
    this.devices = new DeviceStore(this.pool, contentCapacity, this.changes);
    this.vault = new VaultStore(this.pool, contentCapacity);
    this.contacts = new ContactStore(this.pool, this.changes);
    this.publicProfiles = new PublicProfileStore(
      this.pool,
      this.contacts,
      contentCapacity,
    );
    this.communities = new CommunityStore({
      pool: this.pool,
      authority: this.contacts,
      profiles: this.publicProfiles,
      capacity: contentCapacity,
    });
    this.socialDm = new SocialDmStore({
      contacts: this.contacts,
      profiles: this.publicProfiles,
      capacity: contentCapacity,
    });
    this.socialCrypto = new SocialCryptoStore(
      this.socialDm,
      this.publicProfiles,
    );
    this.socialHistory = new SocialHistoryStore(
      this.socialDm,
      this.publicProfiles,
    );
    this.socialMedia = new SocialMediaStore(
      this.pool,
      this.socialDm,
      this.socialHistory,
    );
    this.socialCrypto.setMedia(this.socialMedia);
    this.socialMatrix = new SocialMatrixStore(this.socialDm, this.socialCrypto);
    this.communityMedia = new CommunityMediaStore(
      this.pool,
      this.communities,
      contentCapacity,
    );
    this.communityPosts = new CommunityPostStore({
      pool: this.pool,
      communities: this.communities,
      profiles: this.publicProfiles,
      media: this.communityMedia,
      capacity: contentCapacity,
    });
    this.communityDiscovery = new CommunityDiscoveryStore({
      pool: this.pool,
      communities: this.communities,
      posts: (client, ids) => this.communityPosts.readMany(client, ids),
      capacity: contentCapacity,
    });
    this.representatives = new RepresentativeStore(
      this.pool,
      this.contacts,
      contentCapacity,
    );
    this.daily = new DailyStore(this.pool, this.contacts, contentCapacity);
    this.messageRecovery = new MessageRecoveryStore(
      this.contacts,
      contentCapacity,
    );
    this.calls = new CallStore(this.contacts, contentCapacity, this.daily);
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
    this.backups = new BackupStore(this.pool, this.contacts, contentCapacity, {
      clean: (c, account, item) => this.socialHistory.clean(c, account, item),
      collect: (c, id) => this.socialHistory.collect(c, id),
    });
    this.groups = new GroupStore(
      this.contacts,
      this.devices,
      contentCapacity,
      this.messageRecovery,
    );
    this.groupDaily = new GroupDailyStore(
      this.pool,
      this.groups,
      this.contacts,
      contentCapacity,
    );
    this.matrix = new MatrixStore(this.contacts, contentCapacity, this.groups);
    this.groupMedia = new GroupMediaStore(
      this.pool,
      this.contacts,
      this.groups,
      contentCapacity,
    );
    this.groupRetention = new GroupRetentionStore(
      this.pool,
      this.contacts,
      this.groups,
      contentCapacity,
    );
    this.groupMessages = new GroupMessageStore(this.contacts, this.groups, {
      devices: this.devices,
      capacity: contentCapacity,
      media: this.groupMedia,
    });
    this.statuses = new StatusStore(this.pool, this.contacts, {
      devices: this.devices,
      recovery: this.messageRecovery,
      capacity: contentCapacity,
    });
    this.statusMedia = new StatusMediaStore(
      this.pool,
      this.statuses,
      contentCapacity,
    );
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
