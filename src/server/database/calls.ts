import { AccountError } from '../../shared/account/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type pg from 'pg';
import type { DailyStore } from './daily.ts';
import { assertVaultQuota, assertContentCapacity } from './vault-quota.ts';
export interface CallGate {
  enabled: boolean;
  revision: number;
  allowed: boolean;
  receiving: boolean;
  peerReceiving: boolean;
  peerDirectory: string | null;
  wakeDevices?: string[];
}
/** Persists only the account preference. There is no call/session/history table. */
export class CallStore {
  private readonly contacts: ContactStore;
  private readonly capacity: number;
  private readonly daily: DailyStore;
  constructor(contacts: ContactStore, capacity: number, daily: DailyStore) {
    this.contacts = contacts;
    this.capacity = capacity;
    this.daily = daily;
  }
  async authorize<T>(
    a: ContactAuthority,
    peer: string | null,
    work: (gate: CallGate) => T,
  ): Promise<T> {
    return this.contacts.withMessageAuthority(a, async (client) => {
      const prefs = await client.query<{
        account_id: string;
        enabled: boolean;
        revision: number;
      }>(
        'SELECT account_id,enabled,revision FROM hash_talk.call_controls WHERE account_id=ANY($1::uuid[])',
        [[a.session.accountId, ...(peer ? [peer] : [])]],
      );
      const own = prefs.rows.find(
        (p) => p.account_id === a.session.accountId,
      ) ?? { enabled: true, revision: 0 };
      const other = prefs.rows.find((p) => p.account_id === peer);
      const gate: CallGate = {
        enabled: own.enabled,
        revision: own.revision,
        allowed: false,
        receiving: own.enabled,
        peerReceiving: other?.enabled ?? true,
        peerDirectory: null,
      };
      if (peer) await this.peerGate(client, { a, peer, gate });
      return work(gate);
    });
  }
  private async peerGate(
    client: pg.PoolClient,
    c: { a: ContactAuthority; peer: string; gate: CallGate },
  ): Promise<void> {
    const { a, peer, gate } = c;
    gate.allowed = await this.contacts.messageDeliveryAllowed(
      client,
      a.session.accountId,
      peer,
    );
    const head = await client.query<{ head: string }>(
      'SELECT head FROM hash_talk.device_directories WHERE account_id=$1',
      [peer],
    );
    gate.peerDirectory = head.rows[0]?.head ?? null;
    gate.wakeDevices = await this.daily.callDevices(client, peer);
    const silences = await client.query<{
      account_id: string;
      muted_until: string;
    }>(
      'SELECT account_id,muted_until::text FROM hash_talk.conversation_controls WHERE (account_id=$1 AND peer=$2) OR (account_id=$2 AND peer=$1)',
      [a.session.accountId, peer],
    );
    gate.receiving =
      gate.receiving &&
      !silences.rows.some(
        (p) =>
          p.account_id === a.session.accountId &&
          Number(p.muted_until) > Date.now(),
      );
    gate.peerReceiving =
      gate.peerReceiving &&
      !silences.rows.some(
        (p) => p.account_id === peer && Number(p.muted_until) > Date.now(),
      );
  }
  async configure(
    a: ContactAuthority,
    input: { enabled: boolean; revision: number },
  ): Promise<void> {
    return this.contacts.withMessageAuthority(a, async (c) => {
      const row = await c.query<{ revision: number }>(
        'SELECT revision FROM hash_talk.call_controls WHERE account_id=$1',
        [a.session.accountId],
      );
      if ((row.rows[0]?.revision ?? 0) !== input.revision)
        throw new AccountError(
          409,
          'Preferência mudou em outro aparelho; atualize.',
        );
      await c.query(
        `INSERT INTO hash_talk.call_controls(account_id,enabled,revision) VALUES($1,$2,1) ON CONFLICT(account_id) DO UPDATE SET enabled=$2,revision=hash_talk.call_controls.revision+1 WHERE hash_talk.call_controls.enabled IS DISTINCT FROM $2`,
        [a.session.accountId, input.enabled],
      );
      await assertVaultQuota(c, a.session.accountId);
      await assertContentCapacity(c, this.capacity);
    });
  }
}
