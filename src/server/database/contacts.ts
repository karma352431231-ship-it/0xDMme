import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  canonical,
  digest,
  directoryEvent,
} from '../../shared/devices/index.ts';
import { contactPageSize } from '../../shared/contacts/index.ts';
import type {
  ContactList,
  DiscoveryMode,
  Peer,
  WalletContact,
} from '../../shared/contacts/index.ts';
export interface ContactAuthority {
  session: AccountSession;
  directory: string;
}
interface Controls {
  revision: number;
  mode: DiscoveryMode;
  inviteHash: string | null;
}
interface Relation {
  lo: string;
  hi: string;
  requester: string;
  state: 'pending' | 'approved' | 'rejected';
}
export async function walletHash(wallet: WalletContact): Promise<string> {
  return digest(
    canonical([
      '0xdmme-wallet-permission',
      1,
      wallet.ecosystem,
      wallet.address,
    ]),
  );
}
function unavailable(): never {
  throw new AccountError(404, 'Contato indisponível para esta operação.');
}
export class ContactStore {
  private readonly pool: pg.Pool;
  private readonly changes: import('./changes.ts').DatabaseChanges | undefined;
  private readonly pendingChanges = new WeakMap<
    pg.PoolClient,
    { accounts: Set<string>; authorization: boolean }
  >();
  constructor(pool: pg.Pool, changes?: import('./changes.ts').DatabaseChanges) {
    this.pool = pool;
    this.changes = changes;
  }
  /** Coordinated schema operations register hints; only a successful COMMIT publishes them. */
  changed(
    client: pg.PoolClient,
    accounts: readonly string[],
    authorization = false,
  ): void {
    const pending = this.pendingChanges.get(client);
    if (!pending) throw new Error('Alteração exige transação coordenada.');
    for (const account of accounts) pending.accounts.add(account);
    pending.authorization ||= authorization;
  }
  private async transaction<T>(
    authority: ContactAuthority,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    const pending = { accounts: new Set<string>(), authorization: false };
    this.pendingChanges.set(client, pending);
    try {
      await client.query('BEGIN');
      // All contact admissions share one bounded, short transaction. Device
      // commits use the same account lock and cannot revoke during admission.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('hash-talk:contact-admission'))",
      );
      await client.query(
        'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
        [authority.session.accountId],
      );
      await this.authorize(client, authority);
      const result = await work(client);
      await client.query('COMMIT');
      this.pendingChanges.delete(client);
      this.changes?.committed(pending.accounts, {
        authorization: pending.authorization,
      });
      return result;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      this.pendingChanges.delete(client);
      client.release();
    }
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
      throw new AccountError(401, 'Sessão encerrada ou expirada.');
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
      throw new AccountError(
        409,
        'Autorização do aparelho mudou. Confira novamente.',
      );
  }
  private async controls(
    client: pg.PoolClient,
    accountId: string,
  ): Promise<Controls> {
    const result = await client.query<Controls>(
      'SELECT revision,mode,invite_hash AS "inviteHash" FROM hash_talk.contact_controls WHERE account_id=$1',
      [accountId],
    );
    return result.rows[0] ?? { revision: 0, mode: 'invite', inviteHash: null };
  }
  private async expect(
    client: pg.PoolClient,
    accountId: string,
    revision: number,
  ): Promise<void> {
    if ((await this.controls(client, accountId)).revision !== revision)
      throw new AccountError(
        409,
        'Permissões mudaram em outro aparelho. Atualize e confira antes de repetir.',
      );
  }
  private async bump(client: pg.PoolClient, ids: string[]): Promise<void> {
    await client.query(
      'INSERT INTO hash_talk.contact_controls(account_id,revision) SELECT unnest($1::uuid[]),1 ON CONFLICT(account_id) DO UPDATE SET revision=hash_talk.contact_controls.revision+1',
      [ids],
    );
    this.changed(client, ids);
  }
  private async account(client: pg.PoolClient, id: string): Promise<Peer> {
    const result = await client.query<Peer>(
      'SELECT id AS "accountId",ecosystem,address,display_name AS name FROM hash_talk.accounts WHERE id=$1',
      [id],
    );
    return result.rows[0] ?? unavailable();
  }
  private async relation(
    client: pg.PoolClient,
    a: string,
    b: string,
  ): Promise<Relation | null> {
    const result = await client.query<Relation>(
      'SELECT lo,hi,requester,state FROM hash_talk.contact_relations WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)',
      [a, b],
    );
    return result.rows[0] ?? null;
  }
  private async blocked(
    client: pg.PoolClient,
    a: Peer,
    b: Peer,
  ): Promise<boolean> {
    const result = await client.query(
      'SELECT 1 FROM hash_talk.contact_blocks WHERE (account_id=$1 AND wallet_hash=$2) OR (account_id=$3 AND wallet_hash=$4)',
      [a.accountId, await walletHash(b), b.accountId, await walletHash(a)],
    );
    return !!result.rowCount;
  }
  private async eligible(
    client: pg.PoolClient,
    actor: Peer,
    target: Peer,
    invite: string | null,
  ): Promise<boolean> {
    if (
      actor.accountId === target.accountId ||
      (await this.blocked(client, actor, target))
    )
      return false;
    const ready = await client.query(
      'SELECT 1 FROM hash_talk.device_directories WHERE account_id=$1',
      [target.accountId],
    );
    if (!ready.rowCount) return false;
    const relation = await this.relation(
      client,
      actor.accountId,
      target.accountId,
    );
    if (relation?.state === 'approved') return true;
    const controls = await this.controls(client, target.accountId);
    if (controls.mode === 'contacts') return false;
    if (controls.mode === 'wallet') return true;
    return invite !== null && controls.inviteHash === (await digest(invite));
  }
  async state(authority: ContactAuthority): Promise<Controls> {
    return this.transaction(authority, (c) =>
      this.controls(c, authority.session.accountId),
    );
  }
  /** Coordinate message persistence with contact/device authority in this transaction. */
  async withMessageAuthority<T>(
    authority: ContactAuthority,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.transaction(authority, work);
  }
  async withMessageConsent<T>(
    authority: ContactAuthority,
    targetId: string,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.transaction(authority, async (client) => {
      await client.query(
        'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
        [targetId],
      );
      if (!(await this.allowed(client, authority.session.accountId, targetId)))
        unavailable();
      return work(client);
    });
  }
  /** Called only inside a coordinated message transaction, before releasing payloads. */
  async messageDeliveryAllowed(
    client: pg.PoolClient,
    actorId: string,
    targetId: string,
  ): Promise<boolean> {
    return this.allowed(client, actorId, targetId);
  }
  async list(
    authority: ContactAuthority,
    kind: ContactList,
    after: string | null,
  ): Promise<{ items: unknown[]; next: string | null }> {
    return this.transaction(authority, (client) =>
      this.readList(client, { id: authority.session.accountId, kind, after }),
    );
  }
  private async readList(
    client: pg.PoolClient,
    input: { id: string; kind: ContactList; after: string | null },
  ): Promise<{ items: unknown[]; next: string | null }> {
    const { id, kind, after } = input;
    if (kind === 'blocked') return this.blockList(client, id, after);
    const states: Record<Exclude<ContactList, 'blocked'>, string> = {
      approved: 'approved',
      rejected: 'rejected',
      incoming: 'pending',
      outgoing: 'pending',
    };
    const directions: Record<Exclude<ContactList, 'blocked'>, string> = {
      incoming: 'AND r.requester<>$1',
      outgoing: 'AND r.requester=$1',
      approved: '',
      rejected: '',
    };
    const result = await client.query<Peer & { requester: string }>(
      `SELECT a.id AS "accountId",a.ecosystem,a.address,a.display_name AS name,r.requester FROM hash_talk.contact_relations r JOIN hash_talk.accounts a ON a.id=CASE WHEN r.lo=$1 THEN r.hi ELSE r.lo END WHERE (r.lo=$1 OR r.hi=$1) AND r.state=$2 AND ($3::uuid IS NULL OR a.id>$3) ${directions[kind]} ORDER BY a.id LIMIT $4`,
      [id, states[kind], after, contactPageSize + 1],
    );
    return {
      items: result.rows.slice(0, contactPageSize),
      next:
        result.rows.length > contactPageSize
          ? (result.rows[contactPageSize - 1]?.accountId ?? null)
          : null,
    };
  }
  private async blockList(
    client: pg.PoolClient,
    id: string,
    after: string | null,
  ): Promise<{ items: unknown[]; next: string | null }> {
    const result = await client.query<{ walletHash: string }>(
      'SELECT wallet_hash AS "walletHash" FROM hash_talk.contact_blocks WHERE account_id=$1 AND ($2::text IS NULL OR wallet_hash>$2) ORDER BY wallet_hash LIMIT $3',
      [id, after, contactPageSize + 1],
    );
    return {
      items: result.rows.slice(0, contactPageSize),
      next:
        result.rows.length > contactPageSize
          ? (result.rows[contactPageSize - 1]?.walletHash ?? null)
          : null,
    };
  }
  async snapshot(authority: ContactAuthority): Promise<unknown> {
    return this.transaction(authority, async (client) => {
      const id = authority.session.accountId,
        lists: Partial<Record<ContactList, unknown>> = {};
      for (const kind of [
        'incoming',
        'outgoing',
        'approved',
        'blocked',
        'rejected',
      ] as const)
        lists[kind] = await this.readList(client, { id, kind, after: null });
      return { state: await this.controls(client, id), lists };
    });
  }
  async discover(
    authority: ContactAuthority,
    wallet: WalletContact,
  ): Promise<Peer | null> {
    return this.transaction(authority, async (client) => {
      const result = await client.query<{ id: string }>(
        'SELECT id FROM hash_talk.accounts WHERE ecosystem=$1 AND address=$2',
        [wallet.ecosystem, wallet.address],
      );
      const id = result.rows[0]?.id;
      if (!id) return null;
      const actor = await this.account(client, authority.session.accountId),
        target = await this.account(client, id);
      return (await this.eligible(client, actor, target, null)) ? target : null;
    });
  }
  async inspectInvite(
    authority: ContactAuthority,
    owner: string,
    token: string,
  ): Promise<Peer | null> {
    return this.transaction(authority, async (client) => {
      const exists = await client.query(
        'SELECT 1 FROM hash_talk.accounts WHERE id=$1',
        [owner],
      );
      if (!exists.rowCount) return null;
      const actor = await this.account(client, authority.session.accountId),
        target = await this.account(client, owner);
      const controls = await this.controls(client, owner);
      // Revocation applies even when discovery by wallet remains enabled.
      if (controls.inviteHash !== (await digest(token))) return null;
      return (await this.eligible(client, actor, target, token))
        ? target
        : null;
    });
  }
  async configure(
    authority: ContactAuthority,
    input: { revision: number; mode: DiscoveryMode; inviteHash: string | null },
  ): Promise<Controls> {
    return this.transaction(authority, async (client) => {
      const id = authority.session.accountId;
      await this.expect(client, id, input.revision);
      const current = await this.controls(client, id);
      if (
        current.mode === input.mode &&
        current.inviteHash === input.inviteHash
      )
        return current;
      await client.query(
        'INSERT INTO hash_talk.contact_controls(account_id,revision,mode,invite_hash) VALUES($1,1,$2,$3) ON CONFLICT(account_id) DO UPDATE SET revision=hash_talk.contact_controls.revision+1,mode=$2,invite_hash=$3',
        [id, input.mode, input.inviteHash],
      );
      return this.controls(client, id);
    });
  }
  async request(
    authority: ContactAuthority,
    input: { revision: number; target: string; invite: string | null },
  ): Promise<void> {
    return this.transaction(authority, async (client) => {
      const id = authority.session.accountId;
      await this.expect(client, id, input.revision);
      const actor = await this.account(client, id),
        target = await this.account(client, input.target);
      if (!(await this.eligible(client, actor, target, input.invite)))
        unavailable();
      if (
        input.invite !== null &&
        (await this.controls(client, target.accountId)).inviteHash !==
          (await digest(input.invite))
      )
        unavailable();
      const relation = await this.relation(client, id, target.accountId);
      if (!this.needsRequest(relation, id)) return;
      await client.query(
        "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'pending') ON CONFLICT(lo,hi) DO UPDATE SET requester=$1,state='pending'",
        [id, target.accountId],
      );
      await this.bump(client, [id, target.accountId]);
    });
  }
  private needsRequest(relation: Relation | null, id: string): boolean {
    if (!relation) return true;
    if (relation.state === 'approved') return false;
    if (relation.state === 'pending' && relation.requester === id) return false;
    if (
      relation.state === 'pending' ||
      (relation.state === 'rejected' && relation.requester === id)
    )
      throw new AccountError(
        409,
        'Há uma decisão ou solicitação pendente. Confira a caixa de solicitações.',
      );
    return true;
  }
  async respond(
    authority: ContactAuthority,
    input: { revision: number; target: string; accept: boolean },
  ): Promise<void> {
    return this.transaction(authority, async (client) => {
      const id = authority.session.accountId;
      await this.expect(client, id, input.revision);
      const relation = await this.relation(client, id, input.target);
      if (
        !relation ||
        relation.state !== 'pending' ||
        relation.requester === id
      )
        unavailable();
      if (
        await this.blocked(
          client,
          await this.account(client, id),
          await this.account(client, input.target),
        )
      )
        unavailable();
      await client.query(
        'UPDATE hash_talk.contact_relations SET state=$3 WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)',
        [id, input.target, input.accept ? 'approved' : 'rejected'],
      );
      await this.bump(client, [id, input.target]);
    });
  }
  async block(
    authority: ContactAuthority,
    input: { revision: number; wallet: WalletContact; blocked: boolean },
  ): Promise<void> {
    return this.transaction(authority, async (client) => {
      const id = authority.session.accountId,
        hash = await walletHash(input.wallet);
      await this.expect(client, id, input.revision);
      const own = await this.account(client, id);
      if (hash === (await walletHash(own)))
        throw new AccountError(
          400,
          'Não é possível bloquear a própria wallet.',
        );
      const exists = await client.query(
        'SELECT 1 FROM hash_talk.contact_blocks WHERE account_id=$1 AND wallet_hash=$2',
        [id, hash],
      );
      if (!!exists.rowCount === input.blocked) return;
      if (input.blocked)
        await client.query(
          'INSERT INTO hash_talk.contact_blocks(account_id,wallet_hash) VALUES($1,$2)',
          [id, hash],
        );
      else
        await client.query(
          'DELETE FROM hash_talk.contact_blocks WHERE account_id=$1 AND wallet_hash=$2',
          [id, hash],
        );
      const target = await client.query<{ id: string }>(
        'SELECT id FROM hash_talk.accounts WHERE ecosystem=$1 AND address=$2',
        [input.wallet.ecosystem, input.wallet.address],
      );
      const targetId = target.rows[0]?.id;
      let relationRemoved = false;
      if (input.blocked && targetId) {
        // Approval is withdrawn in both directions. Unblocking never restores it.
        const removed = await client.query(
          'DELETE FROM hash_talk.contact_relations WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)',
          [id, targetId],
        );
        relationRemoved = !!removed.rowCount;
      }
      await this.bump(
        client,
        relationRemoved && targetId ? [id, targetId] : [id],
      );
      if (input.blocked)
        this.changed(client, [id, ...target.rows.map((row) => row.id)], true);
    });
  }
  async unblock(
    authority: ContactAuthority,
    input: { revision: number; walletHash: string },
  ): Promise<void> {
    return this.transaction(authority, async (client) => {
      const id = authority.session.accountId;
      await this.expect(client, id, input.revision);
      const result = await client.query(
        'DELETE FROM hash_talk.contact_blocks WHERE account_id=$1 AND wallet_hash=$2',
        [id, input.walletHash],
      );
      if (result.rowCount) await this.bump(client, [id]);
    });
  }
  async cancel(
    authority: ContactAuthority,
    input: { revision: number; target: string },
  ): Promise<void> {
    return this.transaction(authority, async (client) => {
      const id = authority.session.accountId;
      await this.expect(client, id, input.revision);
      const result = await client.query(
        "DELETE FROM hash_talk.contact_relations WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid) AND requester=$1 AND state='pending'",
        [id, input.target],
      );
      if (result.rowCount) await this.bump(client, [id, input.target]);
    });
  }
  /** Only for an already-open voice: deletion/withdrawn consent never grants a new download. */
  async playbackAllowed(
    authority: ContactAuthority,
    targetId: string,
  ): Promise<boolean> {
    return this.transaction(
      authority,
      async (client) =>
        !(await this.blocked(
          client,
          await this.account(client, authority.session.accountId),
          await this.account(client, targetId),
        )),
    );
  }
  /** Read-only consent check; message admission must check in its transaction. */
  async approved(
    authority: ContactAuthority,
    targetId: string,
  ): Promise<boolean> {
    return this.transaction(authority, (c) =>
      this.allowed(c, authority.session.accountId, targetId),
    );
  }
  private async allowed(
    client: pg.PoolClient,
    actorId: string,
    targetId: string,
  ): Promise<boolean> {
    const relation = await this.relation(client, actorId, targetId);
    if (relation?.state !== 'approved') return false;
    return !(await this.blocked(
      client,
      await this.account(client, actorId),
      await this.account(client, targetId),
    ));
  }
  async directory(
    authority: ContactAuthority,
    targetId: string,
    after: number,
  ): Promise<{ events: unknown[]; revision: number; head: string }> {
    return this.transaction(authority, async (client) => {
      if (!(await this.allowed(client, authority.session.accountId, targetId)))
        unavailable();
      const current = await client.query<{ revision: number; head: string }>(
        'SELECT revision,head FROM hash_talk.device_directories WHERE account_id=$1',
        [targetId],
      );
      const row = current.rows[0] ?? unavailable();
      if (after > row.revision)
        throw new AccountError(409, 'Diretório do contato mudou.');
      const events = await client.query<{ event: unknown }>(
        'SELECT event FROM hash_talk.device_events WHERE account_id=$1 AND revision>$2 ORDER BY revision LIMIT 8',
        [targetId, after],
      );
      return { ...row, events: events.rows.map((r) => r.event) };
    });
  }
}
