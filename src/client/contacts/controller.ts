import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  contactBody,
  contactPageSize,
  contactList,
  discoveryMode,
  peer,
  revision,
  token,
  walletContact,
} from '../../shared/contacts/index.ts';
import type {
  ContactList,
  DiscoveryMode,
  Invitation,
  Peer,
  WalletContact,
} from '../../shared/contacts/index.ts';
import {
  canonical,
  digest,
  eventHash,
  verifyHistory,
} from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
export interface ContactPage {
  items: (Peer & { requester: string })[];
  blocks: string[];
  next: string | null;
}
function rootFingerprint(event: DirectoryEvent): Promise<string> {
  return digest(canonical([event.root.signing, event.root.wrapping]));
}
export class Contacts {
  private readonly access: VaultAccess;
  private generation = 0;
  session: AccountSession | null = null;
  state = {
    revision: 0,
    mode: 'invite' as DiscoveryMode,
    inviteHash: null as string | null,
  };
  pages = new Map<ContactList, ContactPage>();
  constructor(access: VaultAccess) {
    this.access = access;
  }
  setSession(session: AccountSession | null): void {
    if (
      session?.accountId !== this.session?.accountId ||
      session?.csrf !== this.session?.csrf
    ) {
      this.clear();
    }
    this.session = session;
  }
  clear(): void {
    this.generation++;
    this.pages.clear();
    this.state = { revision: 0, mode: 'invite', inviteHash: null };
  }
  async api(
    operation: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.session || !navigator.onLine)
      throw new Error('Entre e conecte-se para conferir as permissões atuais.');
    const generation = this.generation;
    return this.access.withVault(false, async (authority) => {
      if (
        authority.session.accountId !== this.session?.accountId ||
        generation !== this.generation
      )
        throw new Error('Sessão alterada.');
      const proof = { directory: authority.directory, payload };
      const signature = await authority.sign(
        contactBody(
          authority.session.accountId,
          authority.session.deviceId,
          operation,
          proof,
        ),
      );
      const response = await fetch(`/api/account/contacts/${operation}`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          'X-Hash-Talk-CSRF': authority.session.csrf,
        },
        body: JSON.stringify({ ...proof, signature }),
        signal: AbortSignal.timeout(8000),
      });
      const data: unknown = await response.json();
      if (generation !== this.generation)
        throw new Error('Sessão alterada durante a operação.');
      if (!response.ok)
        throw new AccountError(
          response.status,
          String(object(data)['error']).slice(0, 200),
        );
      return data;
    });
  }
  async refresh(): Promise<void> {
    this.acceptState(await this.api('state', {}));
  }
  private acceptState(value: unknown): void {
    const data = object(value);
    keys(data, ['revision', 'mode', 'inviteHash']);
    this.state = {
      revision: revision(data['revision']),
      mode: discoveryMode(data['mode']),
      inviteHash:
        data['inviteHash'] === null ? null : token(data['inviteHash']),
    };
  }
  async snapshot(): Promise<void> {
    const data = object(await this.api('snapshot', {}));
    keys(data, ['state', 'lists']);
    this.acceptState(data['state']);
    const lists = object(data['lists']);
    keys(lists, ['incoming', 'outgoing', 'approved', 'blocked', 'rejected']);
    for (const kind of [
      'incoming',
      'outgoing',
      'approved',
      'blocked',
      'rejected',
    ] as const)
      this.acceptPage(kind, lists[kind]);
  }
  private acceptPage(kind: ContactList, value: unknown): ContactPage {
    const data = object(value);
    keys(data, ['items', 'next']);
    if (!Array.isArray(data['items']) || data['items'].length > contactPageSize)
      throw new Error('Lista de contatos inválida.');
    const values: unknown[] = data['items'];
    const page: ContactPage = {
      items: [],
      blocks: [],
      next:
        data['next'] === null
          ? null
          : kind === 'blocked'
            ? token(data['next'])
            : uuid(data['next']),
    };
    if (kind === 'blocked')
      page.blocks = values.map((v) => token(object(v)['walletHash']));
    else
      page.items = values.map((v) => {
        const raw = object(v);
        keys(raw, ['accountId', 'ecosystem', 'address', 'name', 'requester']);
        return {
          ...peer({
            accountId: raw['accountId'],
            ecosystem: raw['ecosystem'],
            address: raw['address'],
            name: raw['name'],
          }),
          requester: uuid(raw['requester']),
        };
      });
    this.pages.set(kind, page);
    return page;
  }
  async list(kind: ContactList, more = false): Promise<ContactPage> {
    contactList(kind);
    const after = more ? (this.pages.get(kind)?.next ?? null) : null;
    return this.acceptPage(kind, await this.api('list', { kind, after }));
  }
  async discover(wallet: WalletContact): Promise<Peer | null> {
    const result = await this.api('discover', { ...wallet });
    return result === null ? null : peer(result);
  }
  async invite(value: Invitation): Promise<Peer | null> {
    const result = await this.api('invite', { ...value });
    return result === null ? null : peer(result);
  }
  async configure(
    mode: DiscoveryMode,
    inviteHash: string | null,
  ): Promise<void> {
    await this.api('configure', {
      revision: this.state.revision,
      mode,
      inviteHash,
    });
    await this.refresh();
  }
  async request(target: string, invite: string | null): Promise<void> {
    await this.api('request', {
      revision: this.state.revision,
      target,
      invite,
    });
    await this.refresh();
  }
  async respond(target: string, accept: boolean): Promise<void> {
    await this.api('respond', {
      revision: this.state.revision,
      target,
      accept,
    });
    await this.refresh();
  }
  async block(wallet: WalletContact, blocked: boolean): Promise<void> {
    const target = walletContact({
      ecosystem: wallet.ecosystem,
      address: wallet.address,
    });
    await this.api('block', {
      revision: this.state.revision,
      wallet: target,
      blocked,
    });
    await this.refresh();
  }
  async ownIdentity(): Promise<{ accountId: string; fingerprint: string }> {
    const session = this.session,
      generation = this.generation;
    if (!session) throw new Error('Entre e autorize este aparelho primeiro.');
    return this.access.withVault(false, async (authority) => {
      if (authority.session.accountId !== session.accountId)
        throw new Error('Sessão alterada.');
      const first = await verifyHistory(
        authority.events.slice(0, 1),
        session.accountId,
      );
      if (!first) throw new Error('Identidade inicial ausente.');
      const fingerprint = await rootFingerprint(first);
      if (generation !== this.generation)
        throw new Error('Sessão alterada durante a operação.');
      return { accountId: session.accountId, fingerprint };
    });
  }
  async identity(
    target: string,
    known: {
      identity: string | null;
      directory: string | null;
      identityRevision: number;
    },
  ): Promise<{
    fingerprint: string;
    directory: string;
    revision: number;
    event: DirectoryEvent;
  }> {
    const { events, head: lastHead } = await this.directoryHistory(target);
    const event = await verifyHistory(events, target);
    if (!event || (await eventHash(event)) !== lastHead)
      throw new Error('Identidade do contato divergente.');
    // The initial recovery signing/wrapping identity remains pinned across its
    // authenticated migration to wallet recovery; capsule fields may change.
    const first = await verifyHistory(events.slice(0, 1), target);
    if (!first) throw new Error('Identidade inicial ausente.');
    const fingerprint = await rootFingerprint(first);
    checkPinnedIdentity(known, {
      fingerprint,
      revision: event.revision,
      head: lastHead,
    });
    return {
      fingerprint,
      directory: lastHead,
      revision: event.revision,
      event,
    };
  }
  private async directoryHistory(
    target: string,
  ): Promise<{ events: unknown[]; head: string }> {
    const events: unknown[] = [];
    for (let page = 0; page < 16; page++) {
      const data = object(
        await this.api('directory', { target, after: events.length }),
      );
      keys(data, ['events', 'head', 'revision']);
      const raw = data['events'];
      if (!Array.isArray(raw) || raw.length > 8)
        throw new Error('Diretório do contato inválido.');
      events.push(...(raw as unknown[]));
      const head = token(data['head']);
      if (events.length === revision(data['revision'])) return { events, head };
      if (!raw.length) throw new Error('Diretório do contato omitido.');
    }
    throw new Error('Diretório do contato excedido.');
  }
}

export function checkPinnedIdentity(
  known: {
    identity: string | null;
    directory: string | null;
    identityRevision: number;
  },
  current: { fingerprint: string; revision: number; head: string },
): void {
  if (known.identity && known.identity !== current.fingerprint)
    throw new Error(
      'A identidade criptográfica mudou. Compare com o contato por um canal independente antes de aceitar novas chaves.',
    );
  if (known.identityRevision > current.revision)
    throw new Error('Diretório antigo do contato.');
  if (
    known.directory &&
    known.identityRevision === current.revision &&
    known.directory !== current.head
  )
    throw new Error('Diretório divergente do contato.');
}
