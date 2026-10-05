import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import {
  domainClaim,
  domainFreshness,
} from '../../shared/representatives/index.ts';
import type {
  DomainClaim,
  OrganizationRegistration,
  RepresentativeRevocation,
} from '../../shared/representatives/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import { assertContentCapacity, assertVaultQuota } from './vault-quota.ts';
export interface DomainRow {
  organizationId: string;
  claim: DomainClaim;
  record: string;
  verifiedAt: number | null;
  checkedAt: number;
}
export interface CredentialReceipt {
  id: string;
  organizationId: string;
  hash: string;
  issuedAt: number;
  expiresAt: number;
}
export class RepresentativeStore {
  private readonly contacts: ContactStore;
  private readonly pool: pg.Pool;
  private readonly capacity: number;
  constructor(pool: pg.Pool, contacts: ContactStore, capacity: number) {
    this.pool = pool;
    this.contacts = contacts;
    this.capacity = capacity;
  }
  private async budget(c: pg.PoolClient, account: string): Promise<void> {
    await assertVaultQuota(c, account);
    await assertContentCapacity(c, this.capacity);
  }
  async register(
    a: ContactAuthority,
    r: OrganizationRegistration,
  ): Promise<void> {
    await this.contacts.withMessageAuthority(a, async (c) => {
      const inserted = await c.query(
        'INSERT INTO hash_talk.organizations(id,account_id,registration,descriptor_hash) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(id) DO NOTHING',
        [r.organizationId, a.session.accountId, r, r.descriptorHash],
      );
      const old = await this.owned(c, a, r.organizationId);
      if (canonical(old) !== canonical(r))
        throw new AccountError(
          409,
          'Identificador de organização já utilizado.',
        );
      if (inserted.rowCount) await this.budget(c, a.session.accountId);
    });
  }
  private async owned(
    c: pg.PoolClient,
    a: ContactAuthority,
    id: string,
  ): Promise<OrganizationRegistration> {
    const rows = await c.query<{ registration: OrganizationRegistration }>(
      'SELECT registration FROM hash_talk.organizations WHERE id=$1 AND account_id=$2 FOR UPDATE',
      [id, a.session.accountId],
    );
    const r = rows.rows[0]?.registration;
    if (!r) throw new AccountError(404, 'Organização indisponível.');
    return r;
  }
  async registration(
    a: ContactAuthority,
    id: string,
  ): Promise<OrganizationRegistration> {
    return this.contacts.withMessageAuthority(a, (c) => this.owned(c, a, id));
  }
  async issue(a: ContactAuthority, receipt: CredentialReceipt): Promise<void> {
    await this.contacts.withMessageAuthority(a, async (c) => {
      await this.owned(c, a, receipt.organizationId);
      const inserted = await c.query(
        'INSERT INTO hash_talk.representative_credentials(id,organization_id,account_id,hash,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',
        [
          receipt.id,
          receipt.organizationId,
          a.session.accountId,
          receipt.hash,
          receipt.issuedAt,
          receipt.expiresAt,
        ],
      );
      const row = await c.query<{
        hash: string;
        organization_id: string;
        issued_at: string;
        expires_at: string;
      }>(
        'SELECT hash,organization_id,issued_at,expires_at FROM hash_talk.representative_credentials WHERE id=$1',
        [receipt.id],
      );
      if (
        row.rows[0]?.hash !== receipt.hash ||
        row.rows[0]?.organization_id !== receipt.organizationId ||
        Number(row.rows[0]?.issued_at) !== receipt.issuedAt ||
        Number(row.rows[0]?.expires_at) !== receipt.expiresAt
      )
        throw new AccountError(
          409,
          'Identificador de autorização já utilizado.',
        );
      if (inserted.rowCount) await this.budget(c, a.session.accountId);
    });
  }
  async revoke(
    a: ContactAuthority,
    revocation: RepresentativeRevocation,
  ): Promise<void> {
    await this.contacts.withMessageAuthority(a, async (c) => {
      await this.owned(c, a, revocation.organizationId);
      const row = await c.query(
        'UPDATE hash_talk.representative_credentials SET revocation=$1::jsonb WHERE id=$2 AND organization_id=$3 AND hash=$4 AND revocation IS NULL RETURNING id',
        [
          revocation,
          revocation.id,
          revocation.organizationId,
          revocation.credentialHash,
        ],
      );
      if (row.rowCount) return;
      const previous = await c.query<{ revocation: unknown }>(
        'SELECT revocation FROM hash_talk.representative_credentials WHERE id=$1 AND organization_id=$2 AND hash=$3',
        [revocation.id, revocation.organizationId, revocation.credentialHash],
      );
      if (!previous.rows[0]?.revocation)
        throw new AccountError(404, 'Autorização indisponível.');
    });
  }
  async status(
    a: ContactAuthority,
    receipt: Pick<CredentialReceipt, 'id' | 'organizationId' | 'hash'>,
  ): Promise<unknown> {
    return this.contacts.withMessageAuthority(a, async (c) => {
      const row = await c.query<{
        registration: OrganizationRegistration;
        revocation: RepresentativeRevocation | null;
        expires_at: string;
        issued_at: string;
      }>(
        `SELECT o.registration,r.revocation,r.issued_at,r.expires_at FROM hash_talk.representative_credentials r JOIN hash_talk.organizations o ON o.id=r.organization_id WHERE r.id=$1 AND r.organization_id=$2 AND r.hash=$3`,
        [receipt.id, receipt.organizationId, receipt.hash],
      );
      const stored = row.rows[0];
      if (!stored) throw new AccountError(404, 'Autorização não registrada.');
      return {
        registration: stored.registration,
        revocation: stored.revocation,
        issuedAt: Number(stored.issued_at),
        expiresAt: Number(stored.expires_at),
        checkedAt: Date.now(),
        domain: await this.domainInTransaction(c, receipt.organizationId),
      };
    });
  }
  private async domainInTransaction(
    c: Pick<pg.PoolClient, 'query'>,
    id: string,
  ): Promise<DomainRow | null> {
    const rows = await c.query<{
        claim: DomainClaim;
        record: string;
        verified_at: string | null;
        checked_at: string;
      }>(
        'SELECT claim,record,verified_at,checked_at FROM hash_talk.organization_domains WHERE organization_id=$1',
        [id],
      ),
      r = rows.rows[0];
    return r
      ? {
          organizationId: id,
          claim: domainClaim(r.claim),
          record: r.record,
          verifiedAt: r.verified_at === null ? null : Number(r.verified_at),
          checkedAt: Number(r.checked_at),
        }
      : null;
  }
  async bindDomain(
    a: ContactAuthority,
    claim: DomainClaim,
    record: string,
  ): Promise<void> {
    await this.contacts.withMessageAuthority(a, async (c) => {
      await this.owned(c, a, claim.organizationId);
      const previous = await this.domainInTransaction(c, claim.organizationId);
      await c.query(
        `INSERT INTO hash_talk.organization_domains(organization_id,account_id,claim,record) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(organization_id) DO UPDATE SET claim=excluded.claim,record=excluded.record,verified_at=NULL,verified_once=false,checked_at=0 WHERE hash_talk.organization_domains.record<>excluded.record`,
        [claim.organizationId, a.session.accountId, claim, record],
      );
      if (!previous) await this.budget(c, a.session.accountId);
    });
  }
  async domain(a: ContactAuthority, id: string): Promise<DomainRow | null> {
    return this.contacts.withMessageAuthority(a, async (c) => {
      await this.owned(c, a, id);
      return this.domainInTransaction(c, id);
    });
  }
  async unlinkDomain(a: ContactAuthority, id: string): Promise<void> {
    await this.contacts.withMessageAuthority(a, async (c) => {
      await this.owned(c, a, id);
      await c.query(
        'DELETE FROM hash_talk.organization_domains WHERE organization_id=$1',
        [id],
      );
    });
  }
  /** Never holds an SQL transaction during DNS. Conditional write rejects replaced claims. */
  async checkedDomain(row: DomainRow, verified: boolean): Promise<boolean> {
    const result = await this.pool.query(
      'UPDATE hash_talk.organization_domains SET checked_at=$1,verified_at=$2,verified_once=verified_once OR $5 WHERE organization_id=$3 AND record=$4',
      [
        Date.now(),
        verified ? Date.now() : null,
        row.organizationId,
        row.record,
        verified,
      ],
    );
    return result.rowCount === 1;
  }
  async domainsDue(): Promise<DomainRow[]> {
    const rows = await this.pool.query<{ organization_id: string }>(
      `SELECT organization_id FROM hash_talk.organization_domains WHERE checked_at<$1 AND verified_once ORDER BY checked_at LIMIT 2`,
      [Date.now() - domainFreshness / 2],
    );
    const result: DomainRow[] = [];
    for (const r of rows.rows) {
      const row = await this.domainInTransaction(this.pool, r.organization_id);
      if (row) result.push(row);
    }
    return result;
  }
}
