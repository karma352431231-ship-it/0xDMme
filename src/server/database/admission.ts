import type pg from 'pg';
import type { LiveChangeCategory } from '../../shared/live-changes/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { AccountError } from '../../shared/account/index.ts';
import { directoryEvent } from '../../shared/devices/index.ts';
import { ChangeBatch, TransactionChanges } from './transaction-changes.ts';
import type { ChangeDetails } from './transaction-changes.ts';
export type { ChangeDetails } from './transaction-changes.ts';
import type { DatabaseChanges } from './changes.ts';
import type { ContentWriteAllocations } from './content-write-allocations.ts';
import { withAllocationTransaction } from './allocation-transaction.ts';
import { lockContactAdmission } from './contact-admission.ts';
import type { ContactAccess, ContactPeer } from './contact-admission.ts';
export interface ContactAuthority {
  session: AccountSession;
  directory: string;
}
/** One coordinator per Database. It owns transaction-local hints and admission;
 * the Database owns the borrowed pool/allocation resources and their shutdown.
 * Contact consent and other domain ACLs execute inside the admitted callback. */
export class DatabaseAdmission {
  private readonly pool: pg.Pool;
  private readonly changeHints: TransactionChanges;
  private readonly allocations: ContentWriteAllocations | undefined;
  constructor(input: {
    pool: pg.Pool;
    changes?: DatabaseChanges;
    relayChanges: boolean;
    allocations: ContentWriteAllocations | undefined;
  }) {
    this.pool = input.pool;
    this.changeHints = new TransactionChanges(
      input.changes,
      input.relayChanges,
    );
    this.allocations = input.allocations;
  }
  read<T>(
    authority: ContactAuthority,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.transaction(authority, work, 'read');
  }
  write<T>(
    authority: ContactAuthority,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.transaction(authority, work);
  }
  maintenance<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    return this.transaction(null, work);
  }
  participants<T>(
    authority: ContactAuthority,
    peer: ContactPeer,
    work: (
      client: pg.PoolClient,
      participants: readonly string[],
    ) => Promise<T>,
  ): Promise<T> {
    return this.transaction(authority, work, 'pair', peer);
  }
  changed(
    client: pg.PoolClient,
    accounts: readonly string[],
    details: boolean | ChangeDetails = false,
  ): void {
    this.changeHints.changed(
      client,
      accounts,
      typeof details === 'boolean' ? { authorization: details } : details,
    );
  }
  removed(
    client: pg.PoolClient,
    accounts: readonly string[],
    category?: LiveChangeCategory,
  ): void {
    this.changeHints.removed(client, accounts, category);
  }
  private async transaction<T>(
    authority: ContactAuthority | null,
    work: (
      client: pg.PoolClient,
      participants: readonly string[],
    ) => Promise<T>,
    access: ContactAccess = 'write',
    peer?: ContactPeer,
  ): Promise<T> {
    const pending = new ChangeBatch();
    const execute = async (client: pg.PoolClient) => {
      this.changeHints.attach(client, pending);
      try {
        const participants = await this.admit(client, authority, {
          access,
          peer,
        });
        const result = await work(client, participants);
        await this.changeHints.relay(client, pending);
        return result;
      } finally {
        this.changeHints.detach(client);
      }
    };
    const result =
      access === 'pair' && this.allocations
        ? await this.allocations.transaction(this.pool, execute)
        : await withAllocationTransaction(this.pool, execute);
    this.changeHints.committed(pending);
    return result;
  }
  private async admit(
    client: pg.PoolClient,
    authority: ContactAuthority | null,
    input: { access: ContactAccess; peer: ContactPeer | undefined },
  ): Promise<readonly string[]> {
    const participants = await lockContactAdmission(client, {
      actor: authority?.session.accountId ?? null,
      access: input.access,
      ...(input.peer ? { peer: input.peer } : {}),
    });
    if (authority) await this.authorize(client, authority);
    if (input.access === 'read')
      await client.query('SET TRANSACTION READ ONLY');
    return participants;
  }
  private async authorize(
    client: pg.PoolClient,
    authority: ContactAuthority,
  ): Promise<void> {
    const s = authority.session;
    const session = await client.query(
      'SELECT 1 FROM hash_talk.login_sessions WHERE account_id=$1 AND device_id=$2 AND csrf=$3 AND expires_at>now()',
      [s.accountId, s.deviceId, s.csrf],
    );
    if (!session.rowCount)
      throw new AccountError(401, 'Session ended or expired.');
    const directory = await client.query<{ head: string; event: unknown }>(
      'SELECT head,event FROM hash_talk.device_directories WHERE account_id=$1',
      [s.accountId],
    );
    const row = directory.rows[0];
    if (
      !row ||
      row.head !== authority.directory ||
      !directoryEvent(row.event).devices.some((d) => d.id === s.deviceId)
    )
      throw new AccountError(409, 'Device authorization changed. Check again.');
  }
}
