import type { ContentCapacity } from './content-capacity.ts';
import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { directoryEvent } from '../../shared/devices/index.ts';
import type { RecoveryKey } from '../../shared/messages/index.ts';
import { operationOverhead } from '../../shared/vault/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import { assertContentCapacity, assertVaultQuota } from './vault-quota.ts';

/** Backup keys are opaque vault capsules; this module never receives their private half. */
export class MessageRecoveryStore {
  private readonly contacts: ContactStore;
  private readonly capacity: ContentCapacity;
  constructor(contacts: ContactStore, capacity: ContentCapacity) {
    this.contacts = contacts;
    this.capacity = capacity;
  }
  async register(
    authority: ContactAuthority,
    key: RecoveryKey,
  ): Promise<RecoveryKey> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      if (
        key.accountId !== authority.session.accountId ||
        key.deviceId !== authority.session.deviceId ||
        key.directory !== authority.directory
      )
        throw new AccountError(
          403,
          'Key belongs to another account or device.',
        );
      const directory = await client.query<{ event: unknown }>(
        'SELECT event FROM hash_talk.device_directories WHERE account_id=$1',
        [key.accountId],
      );
      const event = directory.rows[0]?.event;
      if (!event || directoryEvent(event).epoch !== key.epoch)
        throw new AccountError(409, 'Recovery epoch changed.');
      const current = await this.epoch(client, key.accountId, key.epoch);
      // A concurrent initializer adopts the accepted capsule, never replaces its key.
      if (current) return current;
      const serialized = JSON.stringify(key);
      await client.query(
        'INSERT INTO hash_talk.message_recovery_keys(account_id,epoch,id,body,charge) VALUES($1,$2,$3,$4::jsonb,$5)',
        [
          key.accountId,
          key.epoch,
          key.id,
          serialized,
          Buffer.byteLength(serialized) + operationOverhead,
        ],
      );
      await assertVaultQuota(client, key.accountId);
      await assertContentCapacity(client, this.capacity);
      return key;
    });
  }
  async current(authority: ContactAuthority): Promise<RecoveryKey | null> {
    return this.contacts.withMessageRead(authority, (client) =>
      this.ownCurrent(client, authority.session.accountId),
    );
  }
  private async ownCurrent(client: pg.PoolClient, account: string) {
    const directory = await client.query<{ event: unknown }>(
      'SELECT event FROM hash_talk.device_directories WHERE account_id=$1',
      [account],
    );
    const event = directory.rows[0]?.event;
    if (!event) throw new AccountError(403, 'Directory missing.');
    return this.epoch(client, account, directoryEvent(event).epoch);
  }
  /** One coherent read under the existing consent and directory locks. */
  async sendPreparation(
    authority: ContactAuthority,
    input: { accountId: string; after: number },
  ) {
    return this.contacts.withMessageConsent(
      authority,
      input.accountId,
      async (client) => ({
        directory: await this.contacts.directoryPage(
          client,
          input.accountId,
          input.after,
        ),
        recovery: {
          own: await this.ownCurrent(client, authority.session.accountId),
          peer: await this.peerCurrent(client, input.accountId),
        },
      }),
    );
  }
  async historical(
    authority: ContactAuthority,
    id: string,
  ): Promise<RecoveryKey> {
    return this.contacts.withMessageRead(authority, async (client) => {
      const result = await client.query<{ body: RecoveryKey }>(
        'SELECT body FROM hash_talk.message_recovery_keys WHERE account_id=$1 AND id=$2',
        [authority.session.accountId, id],
      );
      const key = result.rows[0]?.body;
      if (!key) throw new AccountError(404, 'Historical key missing.');
      return key;
    });
  }
  async peer(
    authority: ContactAuthority,
    accountId: string,
  ): Promise<RecoveryKey | null> {
    return this.contacts.withMessageConsent(authority, accountId, (client) =>
      this.peerCurrent(client, accountId),
    );
  }
  private async peerCurrent(client: pg.PoolClient, accountId: string) {
    const result = await client.query<{ body: RecoveryKey }>(
      "SELECT k.body FROM hash_talk.message_recovery_keys k JOIN hash_talk.device_directories d ON d.account_id=k.account_id AND (d.event->>'epoch')::integer=k.epoch WHERE k.account_id=$1",
      [accountId],
    );
    return result.rows[0]?.body ?? null;
  }
  /** Current group permission is enforced by the coordinating GroupStore transaction. */
  async currentBatch(
    client: pg.PoolClient,
    accounts: string[],
  ): Promise<RecoveryKey[]> {
    if (accounts.length > 16)
      throw new AccountError(413, 'Recovery batch exceeds the limit.');
    const rows = await client.query<{ body: RecoveryKey }>(
      "SELECT k.body FROM hash_talk.message_recovery_keys k JOIN hash_talk.device_directories d ON d.account_id=k.account_id AND (d.event->>'epoch')::integer=k.epoch WHERE k.account_id=ANY($1::uuid[]) ORDER BY k.account_id",
      [accounts],
    );
    return rows.rows.map((r) => r.body);
  }
  private async epoch(
    client: pg.PoolClient,
    accountId: string,
    epoch: number,
  ): Promise<RecoveryKey | null> {
    const result = await client.query<{ body: RecoveryKey }>(
      'SELECT body FROM hash_talk.message_recovery_keys WHERE account_id=$1 AND epoch=$2',
      [accountId, epoch],
    );
    return result.rows[0]?.body ?? null;
  }
}
