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
  private readonly capacity: number;
  constructor(contacts: ContactStore, capacity: number) {
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
        throw new AccountError(403, 'Chave de outra conta ou aparelho.');
      const directory = await client.query<{ event: unknown }>(
        'SELECT event FROM hash_talk.device_directories WHERE account_id=$1',
        [key.accountId],
      );
      const event = directory.rows[0]?.event;
      if (!event || directoryEvent(event).epoch !== key.epoch)
        throw new AccountError(409, 'Época de recuperação mudou.');
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
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const directory = await client.query<{ event: unknown }>(
        'SELECT event FROM hash_talk.device_directories WHERE account_id=$1',
        [authority.session.accountId],
      );
      const event = directory.rows[0]?.event;
      if (!event) throw new AccountError(403, 'Diretório ausente.');
      return this.epoch(
        client,
        authority.session.accountId,
        directoryEvent(event).epoch,
      );
    });
  }
  async historical(
    authority: ContactAuthority,
    id: string,
  ): Promise<RecoveryKey> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const result = await client.query<{ body: RecoveryKey }>(
        'SELECT body FROM hash_talk.message_recovery_keys WHERE account_id=$1 AND id=$2',
        [authority.session.accountId, id],
      );
      const key = result.rows[0]?.body;
      if (!key) throw new AccountError(404, 'Chave histórica ausente.');
      return key;
    });
  }
  async peer(
    authority: ContactAuthority,
    accountId: string,
  ): Promise<RecoveryKey | null> {
    return this.contacts.withMessageConsent(
      authority,
      accountId,
      async (client) => {
        const result = await client.query<{ body: RecoveryKey }>(
          "SELECT k.body FROM hash_talk.message_recovery_keys k JOIN hash_talk.device_directories d ON d.account_id=k.account_id AND (d.event->>'epoch')::integer=k.epoch WHERE k.account_id=$1",
          [accountId],
        );
        return result.rows[0]?.body ?? null;
      },
    );
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
