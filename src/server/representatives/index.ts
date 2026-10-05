import { randomBytes } from 'node:crypto';
import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import { canonical, fingerprint } from '../../shared/devices/index.ts';
import {
  domainClaim,
  domainName,
  domainRecord,
  domainStatement,
  domainWindow,
  organizationRegistration,
  registrationStatement,
  representativeTime,
  revocation,
  revocationStatement,
  verifyWalletStatement,
} from '../../shared/representatives/index.ts';
import type {
  ContactAuthority,
  RepresentativeStore,
} from '../database/index.ts';
import type { DomainResolver } from './dns.ts';
export { DnsDomainResolver } from './dns.ts';
export type { DomainResolver };
export const representativeOperations = [
  'organization-register',
  'representative-register',
  'representative-status',
  'representative-revoke',
  'organization-domain-challenge',
  'organization-domain-bind',
  'organization-domain-verify',
  'organization-domain-unlink',
  'organization-domain-state',
];
export class RepresentativeService {
  private readonly store: RepresentativeStore;
  private readonly resolver: DomainResolver;
  private readonly origin: string;
  constructor(
    store: RepresentativeStore,
    resolver: DomainResolver,
    origin: string,
  ) {
    this.store = store;
    this.resolver = resolver;
    this.origin = origin;
  }
  async operate(
    a: ContactAuthority,
    operation: string,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    const actions: Record<string, () => Promise<unknown>> = {
      'organization-register': () => this.register(a, d),
      'representative-register': () => this.issue(a, d),
      'representative-status': () => this.status(a, d),
      'representative-revoke': () => this.revoke(a, d),
      'organization-domain-challenge': () => this.challenge(a, d),
      'organization-domain-bind': () => this.bind(a, d),
      'organization-domain-verify': () => this.verifyDomain(a, d),
      'organization-domain-state': () => this.domainState(a, d),
      'organization-domain-unlink': async () => {
        keys(d, ['organizationId']);
        await this.store.unlinkDomain(a, uuid(d['organizationId']));
        return { status: 'saved' };
      },
    };
    const action = actions[operation];
    if (!action) throw new AccountError(404, 'Operação indisponível.');
    return action();
  }
  private async register(a: ContactAuthority, d: Record<string, unknown>) {
    keys(d, ['registration']);
    const r = organizationRegistration(d['registration']),
      { signature, ...body } = r;
    if (
      r.origin !== this.origin ||
      canonical(r.issuer) !==
        canonical({
          accountId: a.session.accountId,
          ecosystem: a.session.ecosystem,
          address: a.session.address,
        })
    )
      throw new AccountError(403, 'Wallet emissora divergente.');
    verifyWalletStatement(r.issuer, registrationStatement(body), signature);
    await this.store.register(a, r);
    return { status: 'saved' };
  }
  private async issue(a: ContactAuthority, d: Record<string, unknown>) {
    keys(d, ['id', 'organizationId', 'hash', 'issuedAt', 'expiresAt']);
    const issuedAt = representativeTime(d['issuedAt']),
      expiresAt = representativeTime(d['expiresAt']);
    if (
      expiresAt <= issuedAt ||
      issuedAt > Date.now() + 60_000 ||
      expiresAt <= Date.now()
    )
      throw new AccountError(400, 'Prazo da autorização inválido.');
    await this.store.issue(a, {
      id: uuid(d['id']),
      organizationId: uuid(d['organizationId']),
      hash: fingerprint(d['hash']),
      issuedAt,
      expiresAt,
    });
    return { status: 'saved' };
  }
  private async status(a: ContactAuthority, d: Record<string, unknown>) {
    keys(d, ['id', 'organizationId', 'hash']);
    return this.store.status(a, {
      id: uuid(d['id']),
      organizationId: uuid(d['organizationId']),
      hash: fingerprint(d['hash']),
    });
  }
  private async revoke(a: ContactAuthority, d: Record<string, unknown>) {
    keys(d, ['revocation']);
    const r = revocation(d['revocation']),
      { signature, ...body } = r;
    const registration = await this.store.registration(a, r.organizationId);
    if (r.origin !== this.origin)
      throw new AccountError(403, 'Contexto inválido.');
    verifyWalletStatement(
      registration.issuer,
      revocationStatement(body),
      signature,
    );
    await this.store.revoke(a, r);
    return { status: 'saved' };
  }
  private async challenge(a: ContactAuthority, d: Record<string, unknown>) {
    keys(d, ['organizationId', 'domain']);
    await this.store.registration(a, uuid(d['organizationId']));
    // Challenge is signed by the wallet and stored on bind; an unbound random code grants nothing.
    return {
      organizationId: uuid(d['organizationId']),
      origin: this.origin,
      domain: domainName(d['domain']),
      token: randomBytes(32).toString('hex'),
      expiresAt: Date.now() + domainWindow,
    };
  }
  private async bind(a: ContactAuthority, d: Record<string, unknown>) {
    keys(d, ['claim']);
    const claim = domainClaim(d['claim']),
      registration = await this.store.registration(a, claim.organizationId),
      { signature, ...body } = claim;
    if (
      claim.origin !== this.origin ||
      claim.expiresAt <= Date.now() ||
      claim.expiresAt > Date.now() + domainWindow
    )
      throw new AccountError(400, 'Desafio expirado ou de outro contexto.');
    verifyWalletStatement(
      registration.issuer,
      domainStatement(body),
      signature,
    );
    const record = await domainRecord(claim);
    await this.store.bindDomain(a, claim, record);
    return {
      name: `_0xdmme.${claim.domain}`,
      type: 'TXT',
      value: record,
      expiresAt: claim.expiresAt,
    };
  }
  private async domainState(a: ContactAuthority, d: Record<string, unknown>) {
    keys(d, ['organizationId']);
    return this.store.domain(a, uuid(d['organizationId']));
  }
  private async verifyDomain(a: ContactAuthority, d: Record<string, unknown>) {
    keys(d, ['organizationId']);
    const row = await this.store.domain(a, uuid(d['organizationId']));
    if (!row) throw new AccountError(404, 'Desafio de domínio ausente.');
    if (row.verifiedAt === null && row.claim.expiresAt <= Date.now())
      throw new AccountError(400, 'Desafio expirado. Gere outro código.');
    let matches: boolean;
    try {
      matches = await this.resolver.matches(row.claim.domain, row.record);
    } catch (error: unknown) {
      await this.store.checkedDomain(row, false);
      throw error;
    }
    if (!(await this.store.checkedDomain(row, matches)))
      throw new AccountError(409, 'Vínculo de domínio mudou.');
    return { verified: matches };
  }
  async maintain(): Promise<void> {
    for (const row of await this.store.domainsDue()) {
      let matches = false;
      try {
        matches = await this.resolver.matches(row.claim.domain, row.record);
      } catch {
        /* Failure explicitly removes current verification; maintenance never simulates success. */
      }
      await this.store.checkedDomain(row, matches);
    }
  }
}
