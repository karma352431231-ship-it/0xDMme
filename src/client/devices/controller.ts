import {
  AccountError,
  boundedText,
  keys,
  object,
  profileEnvelope,
} from '../../shared/account/index.ts';
import type {
  AccountSession,
  EncryptedProfile,
} from '../../shared/account/index.ts';
import {
  canonical,
  digest,
  directoryLimit,
  eventHash,
  identityOf,
  linkCode,
  linkProof,
  profileProof,
  sign,
  verifyHistory,
  verifyTransition,
} from '../../shared/devices/index.ts';
import type { DirectoryEvent, LinkCode } from '../../shared/devices/index.ts';
import {
  aesKey,
  createRecovery,
  deviceSecrets,
  newSecret,
  recoverSecrets,
} from '../device-keys/index.ts';
import type { Keyring, LocalIdentity } from '../device-keys/index.ts';
import type { VaultAuthority, VaultLocator } from '../vault-authority/index.ts';
import {
  exclusive,
  localIdentity,
  nameIdentity,
  readCheckpoint,
  saveCheckpoint,
  storedIdentity,
} from '../device-storage/index.ts';
import {
  freshKeyring,
  prepareEvent,
  recoveryIdentities,
  remainingIdentities,
} from '../device-operations/index.ts';
import {
  openProfile,
  profileKey,
  sealProfile,
} from '../account-profile/index.ts';
import type { PrivateProfile } from '../account-profile/index.ts';

function readPage(value: unknown): {
  events: unknown[];
  revision: number;
  head: unknown;
  serverTime: string;
} {
  const data = object(value);
  keys(data, ['events', 'revision', 'head', 'serverTime']);
  const events = data['events'];
  const revision = data['revision'];
  if (
    !Array.isArray(events) ||
    events.length > 8 ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    revision > directoryLimit
  )
    throw new Error('Página de dispositivos inválida.');
  return {
    events: events as unknown[],
    revision,
    head: data['head'],
    serverTime: boundedText(data['serverTime'], 32),
  };
}
async function fetchDirectory(
  session: AccountSession,
  cached: DirectoryEvent[],
) {
  let current = await verifyHistory(cached, session.accountId);
  const events = [...cached];
  for (let page = 0; page <= directoryLimit / 8; page++) {
    const result = readPage(
      await api(session, 'devices/read', { after: events.length }),
    );
    for (const candidate of result.events) {
      current = await verifyTransition(current, candidate);
      if (current.accountId !== session.accountId)
        throw new Error('Conta divergente no diretório.');
      events.push(current);
    }
    if (events.length === result.revision) {
      if ((current ? await eventHash(current) : null) !== result.head)
        throw new Error('Diretório antigo, omitido ou divergente.');
      return { current, events, serverTime: result.serverTime };
    }
    if (!result.events.length) throw new Error('Diretório incompleto.');
  }
  throw new Error('Diretório excedido ou alterado repetidamente.');
}

async function api(
  session: AccountSession,
  path: string,
  input?: unknown,
): Promise<unknown> {
  const response = await fetch(`/api/account/${path}`, {
    method: input === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    headers:
      input === undefined
        ? {}
        : {
            'Content-Type': 'application/json',
            'X-Hash-Talk-CSRF': session.csrf,
          },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    signal: AbortSignal.timeout(8000),
  });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new AccountError(
      response.status,
      boundedText(object(data)['error'], 200),
    );
  return data;
}
export class DeviceController {
  session: AccountSession | null = null;
  current: DirectoryEvent | null = null;
  identity: LocalIdentity | null = null;
  ring: Keyring | null = null;
  recoveryDraft: string | null = null;
  pendingCode: LinkCode | null = null;
  approvalCode: LinkCode | null = null;
  pendingFingerprint = '';
  receipt = '';
  expiresAt = 0;
  trustedRoot: string | null = null;
  private events: DirectoryEvent[] = [];
  private generation = 0;
  private serverTime = '';
  private receiptTarget: string | null = null;
  private assertSession(session: AccountSession): void {
    if (
      session.accountId !== this.session?.accountId ||
      session.deviceId !== this.session.deviceId ||
      session.csrf !== this.session.csrf
    )
      throw new Error('Sessão alterada durante a operação.');
  }
  private async loadIdentity(
    session: AccountSession,
    name?: string,
  ): Promise<void> {
    let identity = await localIdentity(
      session.accountId,
      session.deviceId,
      name || 'Meu aparelho',
    );
    this.assertSession(session);
    if (
      name &&
      !this.current?.devices.some((device) => device.id === session.deviceId)
    )
      identity = await nameIdentity(session.accountId, identity, name);
    this.assertSession(session);
    this.identity = identity;
  }

  setSession(session: AccountSession | null): void {
    if (
      session?.accountId === this.session?.accountId &&
      session?.deviceId === this.session?.deviceId &&
      session?.csrf === this.session?.csrf
    ) {
      this.session = session;
      return;
    }
    this.generation++;
    this.session = session;
    this.current = null;
    this.identity = null;
    this.ring = null;
    this.events = [];
    this.trustedRoot = null;
    this.recoveryDraft = null;
    this.pendingCode = null;
    this.pendingFingerprint = '';
    this.approvalCode = null;
    this.receipt = '';
    this.receiptTarget = null;
    this.expiresAt = 0;
  }
  get authorized(): boolean {
    return this.ring !== null && this.identity !== null;
  }
  async run<T>(operation: (session: AccountSession) => Promise<T>): Promise<T> {
    const session = this.session;
    const generation = this.generation;
    if (!session) throw new Error('Conecte a wallet original primeiro.');
    return exclusive(session.accountId, async () => {
      if (generation !== this.generation)
        throw new Error('Sessão alterada antes da operação.');
      const result = await operation(session);
      if (generation !== this.generation) {
        this.ring = null;
        throw new Error('Sessão alterada durante a operação.');
      }
      return result;
    });
  }
  async refresh(): Promise<void> {
    return this.run((session) => this.synchronize(session));
  }
  async withVault<T>(
    offline: boolean,
    work: (authority: VaultAuthority) => Promise<T>,
  ): Promise<T> {
    return this.run(async (session) => {
      await this.loadIdentity(session);
      if (offline) await this.restoreOffline(session);
      else await this.synchronize(session);
      if (!this.current || !this.ring || !this.identity)
        throw new Error(
          'Autorize ou recupere este aparelho para abrir o cofre.',
        );
      const ring = this.ring;
      const signing = this.identity.signing;
      const authority: VaultAuthority = {
        session,
        offline,
        directory: await eventHash(this.current),
        epoch: ring.epoch,
        events: [...this.events],
        key: async (epoch) => {
          this.assertSession(session);
          const secret = ring.keys[epoch - 1];
          if (!secret) throw new Error('Época de chave indisponível.');
          return aesKey(secret);
        },
        sign: async (proof) => {
          this.assertSession(session);
          return sign(signing, proof);
        },
      };
      const result = await work(authority);
      this.assertSession(session);
      return result;
    });
  }
  async withLocalVault<T>(
    locator: VaultLocator,
    work: (authority: VaultAuthority) => Promise<T>,
  ): Promise<T> {
    return exclusive(locator.accountId, async () => {
      const checkpoint = await readCheckpoint(locator.accountId);
      const event = await verifyHistory(checkpoint.events, locator.accountId);
      if (
        !event ||
        checkpoint.trustedRoot !== (await digest(canonical(event.root)))
      )
        throw new Error(
          'Sem autorização local verificada. Entre e recupere este aparelho.',
        );
      const identity = await storedIdentity(
        locator.accountId,
        locator.deviceId,
      );
      const ring = await deviceSecrets(identity, event);
      return work({
        session: { ...locator, csrf: '' },
        offline: true,
        directory: await eventHash(event),
        epoch: ring.epoch,
        events: checkpoint.events,
        key: async (epoch) => {
          const secret = ring.keys[epoch - 1];
          if (!secret) throw new Error('Época de chave indisponível.');
          return aesKey(secret);
        },
        sign: (proof) => sign(identity.signing, proof),
      });
    });
  }
  private async restoreOffline(session: AccountSession): Promise<void> {
    const checkpoint = await readCheckpoint(session.accountId);
    const current = await verifyHistory(checkpoint.events, session.accountId);
    if (
      !current ||
      !this.identity ||
      checkpoint.trustedRoot !== (await digest(canonical(current.root)))
    )
      throw new Error(
        'Sem autorização local verificada. Conecte-se para recuperar.',
      );
    this.ring = await deviceSecrets(this.identity, current);
    this.current = current;
    this.events = checkpoint.events;
    this.trustedRoot = checkpoint.trustedRoot;
  }
  private async synchronize(session: AccountSession): Promise<void> {
    this.assertSession(session);
    this.ring = null;
    const generation = this.generation;
    const checkpoint = await readCheckpoint(session.accountId);
    const { current, events, serverTime } = await fetchDirectory(
      session,
      checkpoint.events,
    );
    if (generation !== this.generation) throw new Error('Sessão alterada.');
    await saveCheckpoint(session.accountId, {
      events,
      trustedRoot: checkpoint.trustedRoot,
    });
    this.assertSession(session);
    this.current = current;
    this.serverTime = serverTime;
    this.events = events;
    this.trustedRoot = checkpoint.trustedRoot;
    if (
      this.receiptTarget &&
      !current?.devices.some((device) => device.id === this.receiptTarget)
    ) {
      this.receipt = '';
      this.receiptTarget = null;
    }
    if (
      current &&
      this.identity &&
      this.trustedRoot === (await digest(canonical(current.root)))
    ) {
      if (current.devices.some((device) => device.id === session.deviceId))
        this.ring = await deviceSecrets(this.identity, current);
    }
  }
  async privateKey(
    session: AccountSession,
  ): Promise<{ key: CryptoKey; epoch: number } | null> {
    this.setSession(session);
    return this.run(async (current) => {
      // Generate and durably store identity before any public grant is sent.
      await this.loadIdentity(current);
      await this.synchronize(current);
      if (!this.current) {
        const key = await profileKey(
          current.accountId,
          current.profileRevision === 0,
        );
        return key ? { key, epoch: 0 } : null;
      }
      const ring = this.ring;
      return ring
        ? {
            key: await aesKey(ring.keys[ring.keys.length - 1] ?? ''),
            epoch: ring.epoch,
          }
        : null;
    });
  }
  async beginRecovery(name: string): Promise<string> {
    return this.run(async (session) => {
      await this.synchronize(session);
      if (this.current)
        throw new Error(
          'A recuperação já foi configurada. Vincule ou recupere este aparelho.',
        );
      await this.loadIdentity(session, name || 'Meu aparelho');
      this.recoveryDraft = newSecret();
      return this.recoveryDraft;
    });
  }
  private async rotatedProfile(
    session: AccountSession,
    ring: Keyring,
  ): Promise<EncryptedProfile | null> {
    this.assertSession(session);
    const stored = await api(session, 'profile');
    if (stored === null) return null;
    const envelope = profileEnvelope(stored);
    const profile = await this.openStoredProfile(session, envelope);
    try {
      return await sealProfile({
        profile,
        key: await aesKey(ring.keys[ring.keys.length - 1] ?? ''),
        accountId: session.accountId,
        revision: envelope.revision + 1,
      });
    } finally {
      profile.photo?.bytes.fill(0);
    }
  }
  private async openStoredProfile(
    session: AccountSession,
    envelope: EncryptedProfile,
  ): Promise<PrivateProfile> {
    const previousKeys = this.ring?.keys ?? [];
    const legacy = this.current
      ? null
      : await profileKey(session.accountId, false);
    const candidates = legacy
      ? [legacy]
      : await Promise.all([...previousKeys].reverse().map(aesKey));
    for (const key of candidates) {
      try {
        return await openProfile({
          envelope,
          key,
          accountId: session.accountId,
        });
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === 'OperationError'))
          throw error;
        // Historical keys are tried only against authenticated ciphertext.
      }
    }
    throw new Error(
      'Recuperação incompleta: o perfil antigo não abre neste aparelho. Configure pelo navegador que possui a chave do perfil.',
    );
  }
  private async commit(
    session: AccountSession,
    event: DirectoryEvent,
    profile: EncryptedProfile | null,
  ): Promise<void> {
    this.assertSession(session);
    const generation = this.generation;
    // Pin the user-confirmed root before network publication. A lost response
    // or process interruption can then reconcile the signed committed event.
    const trustedRoot = await digest(canonical(event.root));
    await saveCheckpoint(session.accountId, {
      events: this.events,
      trustedRoot,
    });
    this.assertSession(session);
    const response = object(
      await api(session, 'devices/commit', { event, profile }),
    );
    if (
      response['head'] !== (await eventHash(event)) ||
      response['revision'] !== event.revision
    )
      throw new Error(
        'Confirmação de autorização divergente. Atualize para verificar o estado persistido.',
      );
    if (generation !== this.generation) throw new Error('Sessão alterada.');
    const events = [...this.events, event];
    await saveCheckpoint(session.accountId, { events, trustedRoot });
    this.events = events;
    this.current = event;
    this.trustedRoot = trustedRoot;
    if (this.identity && trustedRoot)
      this.ring = await deviceSecrets(this.identity, event);
    this.receipt =
      event.kind === 'link' ? (await eventHash(event)).slice(0, 32) : '';
  }
  async confirmRecovery(confirmation: string): Promise<void> {
    return this.run(async (session) => {
      const secret = this.recoveryDraft;
      if (!secret || confirmation.trim() !== secret)
        throw new Error('Digite a chave guardada para confirmar.');
      await this.synchronize(session);
      if (this.current || !this.identity)
        throw new Error('Configuração já existe ou identidade ausente.');
      const recovery = await createRecovery(session.accountId, secret);
      const ring = freshKeyring(session.accountId);
      const profile = await this.rotatedProfile(session, ring);
      const event = await prepareEvent({
        accountId: session.accountId,
        previous: null,
        kind: 'initialize',
        signer: 'recovery',
        signing: recovery.signing,
        root: recovery.root,
        identities: [this.identity.public],
        ring,
        profile,
      });
      // Round-trip before publishing; the user must have kept the exact secret.
      const restored = await recoverSecrets(event, confirmation.trim());
      if (canonical(restored.ring) !== canonical(ring))
        throw new Error('Verificação local de recuperação falhou.');
      await this.commit(session, event, profile);
      this.recoveryDraft = null;
    });
  }
  async startLink(name: string): Promise<void> {
    return this.run(async (session) => {
      await this.synchronize(session);
      if (this.authorized) throw new Error('Este aparelho já está autorizado.');
      await this.loadIdentity(session, name || 'Novo aparelho');
      if (!this.identity) throw new Error('Identidade local ausente.');
      const code: LinkCode = {
        version: 1,
        accountId: session.accountId,
        id: crypto.randomUUID(),
        nonce: await digest(newSecret()),
        expiresAt: new Date(
          Date.parse(this.serverTime) + 300_000,
        ).toISOString(),
        device: this.identity.public,
      };
      const response = object(
        await api(session, 'devices/start', {
          code,
          signature: await sign(this.identity.signing, linkProof(code)),
        }),
      );
      const remaining =
        Date.parse(String(response['expiresAt'])) -
        Date.parse(String(response['serverTime']));
      if (!(remaining > 0 && remaining <= 300_000))
        throw new Error('Prazo de vinculação inválido.');
      this.pendingCode = code;
      this.pendingFingerprint = await digest(canonical(code.device));
      this.expiresAt = Date.now() + remaining;
    });
  }
  async inspectCode(serialized: string): Promise<string> {
    return this.run(async (session) => {
      await this.synchronize(session);
      if (!this.authorized)
        throw new Error('Use um aparelho autorizado para aprovar.');
      if (serialized.length > 4096) throw new Error('Código excedido.');
      const code = linkCode(JSON.parse(serialized) as unknown);
      await api(session, 'devices/inspect', code);
      this.approvalCode = code;
      return `${code.device.name} · impressão ${await digest(canonical(code.device))}`;
    });
  }
  async approveLink(): Promise<void> {
    return this.run(async (session) => {
      const code = this.approvalCode;
      await this.synchronize(session);
      if (!code || !this.current || !this.ring || !this.identity)
        throw new Error('Confira um código válido antes de autorizar.');
      await api(session, 'devices/inspect', code);
      const event = await prepareEvent({
        accountId: session.accountId,
        previous: this.current,
        kind: 'link',
        signer: session.deviceId,
        signing: this.identity.signing,
        root: this.current.root,
        identities: [...this.current.devices.map(identityOf), code.device],
        ring: this.ring,
        linkId: code.id,
        profile: null,
      });
      await this.commit(session, event, null);
      this.receiptTarget = code.device.id;
      this.approvalCode = null;
    });
  }
  async finishLink(receipt: string): Promise<void> {
    return this.run(async (session) => {
      const pending = this.pendingCode;
      await this.synchronize(session);
      const authorization = this.events.find(
        (event, index) =>
          event.kind === 'link' &&
          event.devices.some((device) => device.id === session.deviceId) &&
          !this.events[index - 1]?.devices.some(
            (device) => device.id === session.deviceId,
          ) &&
          (!pending || event.linkId === pending.id),
      );
      if (
        !authorization ||
        !this.current ||
        !this.identity ||
        receipt.trim().toLowerCase() !==
          (await eventHash(authorization)).slice(0, 32)
      )
        throw new Error(
          'Código de confirmação não confere. Confira no aparelho que autorizou.',
        );
      const ring = await deviceSecrets(this.identity, this.current);
      const trustedRoot = await digest(canonical(this.current.root));
      await saveCheckpoint(session.accountId, {
        events: this.events,
        trustedRoot,
      });
      this.trustedRoot = trustedRoot;
      this.ring = ring;
      this.pendingCode = null;
      this.pendingFingerprint = '';
    });
  }
  async cancelLink(): Promise<void> {
    return this.run(async (session) => {
      if (this.pendingCode)
        await api(session, 'devices/cancel', { id: this.pendingCode.id });
      this.pendingCode = null;
      this.pendingFingerprint = '';
      this.expiresAt = 0;
    });
  }
  async revoke(id: string): Promise<void> {
    return this.run(async (session) => {
      await this.synchronize(session);
      if (
        !this.current ||
        !this.identity ||
        !this.ring ||
        id === session.deviceId ||
        !this.current.devices.some((device) => device.id === id)
      )
        throw new Error('Escolha outro aparelho autorizado para revogar.');
      const ring = freshKeyring(session.accountId, this.ring);
      const profile = await this.rotatedProfile(session, ring);
      const event = await prepareEvent({
        accountId: session.accountId,
        previous: this.current,
        kind: 'revoke',
        signer: session.deviceId,
        signing: this.identity.signing,
        root: this.current.root,
        identities: remainingIdentities(this.current, id),
        ring,
        profile,
      });
      await this.commit(session, event, profile);
    });
  }
  async recover(input: {
    secret: string;
    name: string;
    revoked: string[];
    revision: number;
  }): Promise<void> {
    return this.run(async (session) => {
      await this.synchronize(session);
      if (!this.current)
        throw new Error('A conta ainda não possui chave de recuperação.');
      if (this.current.revision !== input.revision)
        throw new Error(
          'A lista de aparelhos mudou. Confira sua escolha novamente.',
        );
      const retained = recoveryIdentities(this.current, input.revoked);
      await this.loadIdentity(session, input.name || 'Aparelho recuperado');
      if (!this.identity) throw new Error('Identidade local ausente.');
      const recovered = await recoverSecrets(this.current, input.secret.trim());
      this.assertSession(session);
      this.ring = recovered.ring;
      const ring = freshKeyring(session.accountId, recovered.ring);
      const profile = await this.rotatedProfile(session, ring);
      const event = await prepareEvent({
        accountId: session.accountId,
        previous: this.current,
        kind: 'recover',
        signer: 'recovery',
        signing: recovered.signing,
        root: this.current.root,
        identities: [...retained, this.identity.public],
        ring,
        profile,
      });
      await this.commit(session, event, profile);
    });
  }
  async saveProfile(
    session: AccountSession,
    profile: EncryptedProfile,
    encryptedEpoch: number,
  ): Promise<void> {
    this.assertSession(session);
    if (!this.current) {
      await api(session, 'profile', profile);
      return;
    }
    const expected = await eventHash(this.current);
    return this.run(async (current) => {
      await this.synchronize(current);
      if (
        !this.current ||
        !this.identity ||
        !this.ring ||
        (await eventHash(this.current)) !== expected ||
        this.current.epoch !== encryptedEpoch
      )
        throw new Error(
          'Dispositivos alterados. Recarregue o perfil antes de salvar.',
        );
      const signature = await sign(
        this.identity.signing,
        profileProof(session.accountId, session.deviceId, expected, profile),
      );
      await api(session, 'devices/profile', {
        head: expected,
        profile,
        signature,
      });
    });
  }
  clearTransient(): void {
    this.generation++;
    this.identity = null;
    this.recoveryDraft = null;
    this.pendingCode = null;
    this.pendingFingerprint = '';
    this.approvalCode = null;
    this.ring = null;
    this.receipt = '';
    this.receiptTarget = null;
  }
}
