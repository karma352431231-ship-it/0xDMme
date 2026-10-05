import { AccountError, object } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import {
  acceptanceStatement,
  credentialStatement,
  credential,
  domainClaim,
  domainStatement,
  domainFreshness,
  organization,
  organizationRegistration,
  registrationStatement,
  representativeHash,
  representativeCard,
  verifyRepresentativeCard,
  revocation,
  revocationStatement,
  verifyWalletStatement,
} from '../../shared/representatives/index.ts';
import type {
  Organization,
  OrganizationRegistration,
  RepresentativeCard,
  RepresentativeIdentity,
} from '../../shared/representatives/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { messageApi } from '../message-api/index.ts';
export interface OwnedOrganization {
  organization: Organization;
  registration: OrganizationRegistration;
}
export interface CheckedRepresentative {
  status: string;
  domain: string | null;
  domainCurrent: boolean;
}
export type RepresentativeSigner = (message: string) => Promise<string>;
const organizationLabel = '0xDMme:organization:v1',
  credentialLabel = '0xDMme:representative:v1';
export class Representatives {
  session: AccountSession | null = null;
  organizations: OwnedOrganization[] = [];
  cards: RepresentativeCard[] = [];
  hasMore = false;
  private loaded = 0;
  private readonly access: VaultAccess;
  private readonly sync: VaultSync;
  private readonly sign: RepresentativeSigner;
  private generation = 0;
  constructor(
    access: VaultAccess,
    sync: VaultSync,
    sign: RepresentativeSigner,
  ) {
    this.access = access;
    this.sync = sync;
    this.sign = sign;
  }
  setSession(session: AccountSession | null): void {
    this.generation++;
    this.session = session;
    this.organizations = [];
    this.cards = [];
    this.loaded = 0;
    this.hasMore = false;
  }
  private guard(generation: number): void {
    if (generation !== this.generation || !this.session)
      throw new Error('Sessão alterada.');
  }
  private identity(): RepresentativeIdentity {
    if (!this.session) throw new Error('Entre na sua conta.');
    return {
      accountId: this.session.accountId,
      ecosystem: this.session.ecosystem,
      address: this.session.address,
    };
  }
  private async api(
    op: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    const generation = this.generation;
    return this.access.withVault(false, (a) =>
      messageApi(a, op, data, () => this.guard(generation)),
    );
  }
  private async signed(message: string): Promise<string> {
    const generation = this.generation,
      identity = this.identity(),
      signature = await this.sign(message);
    this.guard(generation);
    verifyWalletStatement(identity, message, signature);
    return signature;
  }
  async load(more = false): Promise<void> {
    const generation = this.generation,
      deadline = Date.now() + 60_000;
    do {
      if (Date.now() > deadline)
        throw new Error('Sincronização não concluída. Tente novamente.');
      await this.sync.refresh();
      this.guard(generation);
    } while (!this.sync.complete);
    const organizations: OwnedOrganization[] = more
        ? [...this.organizations]
        : [],
      cards: RepresentativeCard[] = more ? [...this.cards] : [],
      entries = [...this.sync.currentHeads().values()]
        .flat()
        .filter((e) =>
          [organizationLabel, credentialLabel].includes(e.change.label),
        ),
      start = more ? this.loaded : 0;
    for (const entry of entries.slice(start, start + 50)) {
      const value: unknown = JSON.parse(await this.sync.open(entry.commit.id));
      this.guard(generation);
      if (entry.change.label === credentialLabel) {
        cards.push(await verifyRepresentativeCard(value, location.origin));
        continue;
      }
      organizations.push(await this.readOwned(value));
    }
    this.guard(generation);
    this.organizations = organizations;
    this.cards = cards;
    this.loaded = start + 50;
    this.hasMore = entries.length > this.loaded;
  }
  private async readOwned(value: unknown): Promise<OwnedOrganization> {
    const raw = object(value),
      org = organization(raw['organization']),
      registration = organizationRegistration(raw['registration']);
    if (
      (await representativeHash(org)) !== registration.descriptorHash ||
      org.id !== registration.organizationId ||
      org.origin !== location.origin ||
      registration.origin !== location.origin ||
      canonical(registration.issuer) !== canonical(org.issuer) ||
      canonical(org.issuer) !== canonical(this.identity())
    )
      throw new Error('Registro de organização divergente.');
    const { signature, ...body } = registration;
    verifyWalletStatement(org.issuer, registrationStatement(body), signature);
    return { organization: org, registration };
  }
  private async save(
    input: { id: string; label: string; value: unknown },
    generation: number,
  ): Promise<void> {
    this.guard(generation);
    const { id, label, value } = input;
    const parents = this.sync.heads(id).map((e) => e.commit.id);
    await this.sync.save({
      change: { version: 1, entity: id, kind: 'settings', parents, label },
      value: JSON.stringify(value),
    });
    this.guard(generation);
  }
  async create(name: string): Promise<void> {
    const generation = this.generation;
    const org = organization({
      version: 1,
      id: crypto.randomUUID(),
      origin: location.origin,
      name,
      issuer: this.identity(),
    });
    const body = {
      organizationId: org.id,
      origin: org.origin,
      issuer: org.issuer,
      descriptorHash: await representativeHash(org),
    };
    this.guard(generation);
    const registration = {
      ...body,
      signature: await this.signed(registrationStatement(body)),
    };
    // Preserve the signed draft before server mutation; retry never needs a replacement identity.
    await this.save(
      {
        id: org.id,
        label: organizationLabel,
        value: {
          organization: org,
          registration,
        },
      },
      generation,
    );
    await this.api('organization-register', { registration });
    await this.load();
  }
  async registerOwned(org: OwnedOrganization): Promise<void> {
    await this.api('organization-register', { registration: org.registration });
  }
  async issue(
    org: OwnedOrganization,
    subject: Peer,
    scope: string,
    expiresAt: number,
  ): Promise<RepresentativeCard> {
    const generation = this.generation;
    await this.registerOwned(org);
    this.guard(generation);
    const { signature: _draftSignature, ...body } = credential({
      version: 1 as const,
      id: crypto.randomUUID(),
      organization: org.organization,
      registration: org.registration,
      subject: {
        accountId: subject.accountId,
        ecosystem: subject.ecosystem,
        address: subject.address,
      },
      scope,
      issuedAt: Date.now(),
      expiresAt,
      signature: 'draft',
    });
    void _draftSignature;
    const card = representativeCard({
      credential: {
        ...body,
        signature: await this.signed(credentialStatement(body)),
      },
      acceptance: null,
    });
    await verifyRepresentativeCard(card, location.origin);
    await this.save(
      { id: card.credential.id, label: credentialLabel, value: card },
      generation,
    );
    await this.registerCredential(card);
    await this.load();
    return card;
  }
  async registerCredential(card: RepresentativeCard): Promise<void> {
    const c = card.credential,
      generation = this.generation;
    if (c.organization.issuer.accountId !== this.session?.accountId)
      throw new Error('Somente o emissor registra esta autorização.');
    const hash = await representativeHash(c);
    this.guard(generation);
    await this.api('representative-register', {
      id: c.id,
      organizationId: c.organization.id,
      hash,
      issuedAt: c.issuedAt,
      expiresAt: c.expiresAt,
    });
  }
  async check(input: RepresentativeCard): Promise<CheckedRepresentative> {
    const generation = this.generation,
      card = await verifyRepresentativeCard(input, location.origin),
      c = card.credential,
      hash = await representativeHash(c);
    this.guard(generation);
    if (c.issuedAt > Date.now() + 60_000) throw new Error('Emissão no futuro.');
    if (c.expiresAt <= Date.now())
      return { status: 'Expirada', domain: null, domainCurrent: false };
    const raw = object(
      await this.api('representative-status', {
        id: c.id,
        organizationId: c.organization.id,
        hash,
      }),
    );
    this.guard(generation);
    this.checkReceipt(card, raw);
    if (raw['revocation'] !== null) {
      this.checkRevocation(card, hash, raw['revocation']);
      return { status: 'Revogada', domain: null, domainCurrent: false };
    }
    return this.checkedDomain(card, raw['domain']);
  }
  private checkReceipt(
    card: RepresentativeCard,
    raw: Record<string, unknown>,
  ): void {
    const c = card.credential;
    if (
      canonical(raw['registration']) !== canonical(c.registration) ||
      raw['issuedAt'] !== c.issuedAt ||
      raw['expiresAt'] !== c.expiresAt
    )
      throw new Error('Estado da autorização divergente.');
    const checkedAt = Number(raw['checkedAt']);
    if (
      !Number.isSafeInteger(checkedAt) ||
      Math.abs(Date.now() - checkedAt) > 60_000
    )
      throw new Error('Estado sem atualização suficiente.');
  }
  private checkRevocation(
    card: RepresentativeCard,
    hash: string,
    input: unknown,
  ): void {
    const c = card.credential,
      r = revocation(input),
      { signature, ...body } = r;
    if (
      r.id !== c.id ||
      r.organizationId !== c.organization.id ||
      r.credentialHash !== hash ||
      r.origin !== location.origin
    )
      throw new Error('Revogação divergente.');
    verifyWalletStatement(
      c.organization.issuer,
      revocationStatement(body),
      signature,
    );
  }
  private checkedDomain(
    card: RepresentativeCard,
    input: unknown,
  ): CheckedRepresentative {
    const result = {
      status: card.acceptance
        ? 'Vigente — aceite verificado'
        : 'Vigente — aguardando aceite',
      domain: null as string | null,
      domainCurrent: false,
    };
    if (input === null) return result;
    const raw = object(input),
      claim = domainClaim(raw['claim']),
      { signature, ...body } = claim;
    if (
      claim.organizationId !== card.credential.organization.id ||
      claim.origin !== location.origin
    )
      throw new Error('Vínculo do domínio divergente.');
    verifyWalletStatement(
      card.credential.organization.issuer,
      domainStatement(body),
      signature,
    );
    result.domain = claim.domain;
    const verifiedAt = raw['verifiedAt'];
    result.domainCurrent =
      typeof verifiedAt === 'number' &&
      verifiedAt <= Date.now() + 60_000 &&
      Date.now() - verifiedAt < domainFreshness;
    return result;
  }
  async accept(card: RepresentativeCard): Promise<void> {
    const generation = this.generation;
    await verifyRepresentativeCard(card, location.origin);
    this.guard(generation);
    if (canonical(card.credential.subject) !== canonical(this.identity()))
      throw new Error('Esta autorização pertence a outra conta.');
    const checked = await this.check(card);
    this.guard(generation);
    if (checked.status === 'Revogada' || checked.status === 'Expirada')
      throw new Error(checked.status);
    const body = {
      credentialHash: await representativeHash(card.credential),
      subject: this.identity(),
    };
    this.guard(generation);
    const accepted = {
      ...card,
      acceptance: {
        ...body,
        signature: await this.signed(
          acceptanceStatement(body, location.origin),
        ),
      },
    };
    await this.save(
      { id: card.credential.id, label: credentialLabel, value: accepted },
      generation,
    );
    await this.load();
  }
  async revoke(card: RepresentativeCard): Promise<void> {
    const c = card.credential,
      generation = this.generation;
    const body = {
      organizationId: c.organization.id,
      id: c.id,
      credentialHash: await representativeHash(c),
      origin: location.origin,
    };
    this.guard(generation);
    await this.api('representative-revoke', {
      revocation: {
        ...body,
        signature: await this.signed(revocationStatement(body)),
      },
    });
  }
  async domainChallenge(id: string, domain: string): Promise<unknown> {
    const generation = this.generation;
    const response = object(
      await this.api('organization-domain-challenge', {
        organizationId: id,
        domain,
      }),
    );
    const claim = domainClaim({ ...response, signature: 'pending' }),
      { signature, ...body } = claim;
    void signature;
    this.guard(generation);
    return this.api('organization-domain-bind', {
      claim: { ...body, signature: await this.signed(domainStatement(body)) },
    });
  }
  async domainState(id: string): Promise<unknown> {
    return this.api('organization-domain-state', { organizationId: id });
  }
  async verifyDomain(id: string): Promise<unknown> {
    return this.api('organization-domain-verify', { organizationId: id });
  }
  async unlinkDomain(id: string): Promise<void> {
    await this.api('organization-domain-unlink', { organizationId: id });
  }
}
export function representativeFailure(error: unknown): string {
  if (error instanceof AccountError || error instanceof Error)
    return error.message;
  return 'Não foi possível concluir a autorização.';
}
