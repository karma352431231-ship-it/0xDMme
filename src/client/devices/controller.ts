import { AuthorityKeys } from './authority-keys.ts';
import { applicationOrigin } from '../application-origin/index.ts';
import { measureWork } from '../synchronization-diagnostics/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { authoritySignature } from './authority-signature.ts';
import { AuthorityWork } from './authority-work.ts';
import type { AuthorityTurnContext } from './authority-work.ts';
import { authorityTurn } from './authority-turns.ts';
import { SigningLane } from './signing-lane.ts';
import type { VerifiedSigner } from './signing-lane.ts';
import { fetchApi, readApiJson } from '../api-response/index.ts';
import {
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
  openFrom,
  createRecovery,
  deviceSecrets,
  newSecret,
  recoverSecrets,
} from '../device-keys/index.ts';
import type { Keyring, LocalIdentity } from '../device-keys/index.ts';
import type {
  SigningAuthority,
  VaultAuthority,
  VaultLocator,
  VaultWorkOptions,
} from '../vault-authority/index.ts';
import {
  exclusive,
  localIdentity,
  nameIdentity,
  readCheckpoint,
  saveCheckpoint,
  advanceCheckpoint,
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
import {
  createWalletRecovery,
  walletRecoveryKey,
} from '../wallet-recovery/index.ts';
import { recoveryIdentity } from '../../shared/wallet-recovery/index.ts';
import type { WalletRecovery } from '../../shared/wallet-recovery/index.ts';
import { forgetRecovery } from '../recovery-return/index.ts';
import type { RecoveryPlan, RecoveryFlow } from '../recovery-return/index.ts';
import {
  enrollmentBody,
  enrollmentHash,
  enrollmentMac,
} from '../../shared/device-enrollment/index.ts';
import type { EnrollmentCode } from '../../shared/device-enrollment/index.ts';
import { DeviceLinking, joinDeviceEnrollment } from './linking.ts';
import { deviceKeysLost, lostDevices } from './lost-keys.ts';
import { DeviceWalletRecovery } from './wallet-recovery-flow.ts';
import type {
  WalletRecoveryStart,
  RecoveryCompletion,
} from './wallet-recovery-flow.ts';

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
    throw new Error('Invalid device page.');
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
        throw new Error('Account does not match the directory.');
      events.push(current);
    }
    if (events.length === result.revision) {
      if ((current ? await eventHash(current) : null) !== result.head)
        throw new Error('Directory outdated, omitted or inconsistent.');
      return { current, events, serverTime: result.serverTime };
    }
    if (!result.events.length) throw new Error('Directory incomplete.');
  }
  throw new Error('Directory exceeds the limit or changed repeatedly.');
}

async function api(
  session: Pick<AccountSession, 'csrf'>,
  path: string,
  input?: unknown,
): Promise<unknown> {
  const response = await fetchApi(`account/${path}`, `/api/account/${path}`, {
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
  const data = await readApiJson(response, `account/${path}`);
  return data;
}
export class DeviceController {
  private readonly walletRecovery = new DeviceWalletRecovery({
    session: () => this.session,
    run: (operation) => this.run(operation),
    plan: (session, input) => this.walletPlan(session, input),
    loadIdentity: (session) => this.loadIdentity(session),
    receiver: () => this.identity,
    validateSelection: (plan) => {
      if (plan.mode === 'recover' && this.current)
        recoveryIdentities(this.current, plan.revoked);
    },
    verify: async (session, flow) => {
      await this.synchronize(session);
      this.validateWalletMode(flow.mode, flow.revision);
      if ((this.current ? await eventHash(this.current) : null) !== flow.head)
        throw new Error(
          'Authorization changed during signing. Cancel and check again.',
        );
    },
    lease: (session) => {
      const token = this.generation;
      return (message) => {
        this.assertSession(session);
        if (token !== this.generation) throw new Error(message);
      };
    },
    complete: (input) => this.completeWalletRecovery(input),
  });
  private readonly linking = new DeviceLinking({
    run: (operation) => this.run(operation),
    start: (session, name) => this.prepareLink(session, name),
    inspect: (session, serialized) => this.inspectLink(session, serialized),
    authorize: (session, code) => this.authorizeLink(session, code),
    confirm: (session, pending, receipt) =>
      this.confirmLink(session, pending, receipt),
    cancel: async (session, code) => {
      await api(session, 'devices/cancel', { id: code.id });
    },
    enrollmentCandidate: (id) =>
      this.run((session) => api(session, 'devices/enrollment-pending', { id })),
  });
  private readonly authorityWork = new AuthorityWork((key, body, options) =>
    authorityTurn(key, body, options),
  );
  /** When this controller last completed an online directory read, for
   * operations that follow it inside the same native turn. */
  private directoryReadAt: number | null = null;
  /** Directory hash and event count the last exclusive read verified while
   * this device held a key ring; replaced only when a read completes. */
  private verified: { directory: string; events: number } | null = null;
  private readonly signingLane = new SigningLane({
    verified: () => this.verifiedSigner(),
    position: (signer, after) =>
      measureWork(this, 'authority/signing-directory', async () => {
        const page = readPage(
          await api(signer.session, 'devices/read', {
            after,
          }),
        );
        return {
          events: page.events.length,
          revision: page.revision,
          head: page.head,
        };
      }),
    exclusive: (work) => this.withVault(false, (authority) => work(authority)),
  });
  async createEnrollment(): Promise<EnrollmentCode> {
    return this.withVault(false, async (a) => {
      if (this.session?.walletConfirmed !== true)
        throw new Error('Confirm your wallet to link another device.');
      const code: EnrollmentCode = {
        version: 1,
        id: crypto.randomUUID(),
        accountId: a.session.accountId,
        root: await digest(canonical(this.current?.root)),
        secret: [...crypto.getRandomValues(new Uint8Array(32))]
          .map((v) => v.toString(16).padStart(2, '0'))
          .join(''),
        expiresAt: new Date(
          Date.parse(this.serverTime) + 300_000,
        ).toISOString(),
      };
      const payload = {
        id: code.id,
        codeHash: await enrollmentHash(code),
        root: code.root,
        head: a.directory,
        expiresAt: code.expiresAt,
      };
      if (!this.session) throw new Error('Session missing.');
      await api(this.session, 'devices/enrollment-create', {
        ...payload,
        signature: await a.sign(
          enrollmentBody(a.session.accountId, a.session.deviceId, payload),
        ),
      });
      return code;
    });
  }
  async joinEnrollment(serialized: string): Promise<AccountSession> {
    const session = await joinDeviceEnrollment(serialized, (invitation) =>
      this.prepareEnrollment(invitation),
    );
    this.setSession(session);
    return session;
  }
  private async prepareEnrollment(
    invitation: EnrollmentCode,
  ): Promise<{ deviceId: string; input: unknown }> {
    const deviceId = crypto.randomUUID();
    const identity = await localIdentity(
      invitation.accountId,
      deviceId,
      t('My device'),
    );
    const checkpoint = await readCheckpoint(invitation.accountId);
    if (checkpoint.trustedRoot && checkpoint.trustedRoot !== invitation.root)
      throw new Error("Code differs from the account's known identity.");
    await saveCheckpoint(invitation.accountId, {
      ...checkpoint,
      trustedRoot: invitation.root,
    });
    const code: LinkCode = {
      version: 1,
      accountId: invitation.accountId,
      id: crypto.randomUUID(),
      nonce: await digest(newSecret()),
      expiresAt: invitation.expiresAt,
      device: identity.public,
    };
    const input = {
      id: invitation.id,
      codeHash: await enrollmentHash(invitation),
      code,
      signature: await sign(identity.signing, linkProof(code)),
      proof: await enrollmentMac(invitation.secret, code),
    };
    return { deviceId, input };
  }
  approveEnrollment(invitation: EnrollmentCode): Promise<boolean> {
    return this.linking.approveEnrollment(invitation);
  }
  session: AccountSession | null = null;
  current: DirectoryEvent | null = null;
  identity: LocalIdentity | null = null;
  ring: Keyring | null = null;
  /** The directory lists this session's device under keys no longer held here.
   * Only a sign-in with a new device id can recover it. */
  keysLost = false;
  get walletPending(): RecoveryFlow | null {
    return this.walletRecovery.flow;
  }
  set walletPending(flow: RecoveryFlow | null) {
    this.walletRecovery.replaceFlow(flow);
  }
  get pendingCode(): LinkCode | null {
    return this.linking.pendingCode;
  }
  get approvalCode(): LinkCode | null {
    return this.linking.approvalCode;
  }
  get pendingFingerprint(): string {
    return this.linking.pendingFingerprint;
  }
  receipt = '';
  get expiresAt(): number {
    return this.linking.expiresAt;
  }
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
      throw new Error('Session changed during the operation.');
  }
  private async loadIdentity(
    session: AccountSession,
    name?: string,
  ): Promise<void> {
    let identity = await localIdentity(
      session.accountId,
      session.deviceId,
      name || t('My device'),
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

  private sameSession(session: AccountSession | null): boolean {
    return (
      session?.accountId === this.session?.accountId &&
      session?.deviceId === this.session?.deviceId &&
      session?.csrf === this.session?.csrf
    );
  }
  setSession(session: AccountSession | null): void {
    if (this.sameSession(session)) {
      this.session = session;
      return;
    }
    if (this.session) forgetRecovery(this.session);
    this.generation++;
    this.session = session;
    this.current = null;
    this.identity = null;
    this.ring = null;
    this.keysLost = false;
    this.events = [];
    this.trustedRoot = null;
    this.walletRecovery.reset();
    this.linking.resetSession();
    this.receipt = '';
    this.receiptTarget = null;
    this.directoryReadAt = null;
    this.verified = null;
  }
  get authorized(): boolean {
    return this.ring !== null && this.identity !== null;
  }
  async run<T>(
    operation: (
      session: AccountSession,
      turn: AuthorityTurnContext,
    ) => Promise<T>,
    options: VaultWorkOptions = {},
  ): Promise<T> {
    const session = this.session;
    const generation = this.generation;
    if (!session) throw new Error('Connect the original wallet first.');
    return this.authorityWork.hold(
      session.accountId,
      async (turn) => {
        if (generation !== this.generation)
          throw new Error('Session changed before the operation.');
        const result = await operation(session, turn);
        if (generation !== this.generation) {
          this.ring = null;
          throw new Error('Session changed during the operation.');
        }
        return result;
      },
      options.priority,
      options,
    );
  }
  /** A follower inside the same native turn reuses the directory its leader
   * read under one second ago. Every request still carries the signed
   * directory, which the server checks with the session and this device. */
  private reusesTurnDirectory(turn: AuthorityTurnContext): boolean {
    return (
      turn.follower &&
      this.directoryReadAt !== null &&
      performance.now() - this.directoryReadAt < 1000 &&
      this.current !== null &&
      this.ring !== null
    );
  }
  async refresh(): Promise<void> {
    return this.run(async (session) => {
      await this.loadIdentity(session);
      await this.synchronize(session);
      await this.restoreWalletPending(session);
    });
  }
  /** Signed requests that touch no vault key, secret or SDK state. */
  withSigner<T>(work: (authority: SigningAuthority) => Promise<T>): Promise<T> {
    return this.signingLane.run(work);
  }
  private verifiedSigner(): VerifiedSigner | null {
    const session = this.session,
      identity = this.identity,
      verified = this.verified,
      generation = this.generation;
    if (!session || !identity || !verified) return null;
    return {
      session: {
        accountId: session.accountId,
        deviceId: session.deviceId,
        csrf: session.csrf,
      },
      directory: verified.directory,
      events: verified.events,
      sign: this.signingAuthority(session, identity.signing),
      current: () => generation === this.generation,
    };
  }
  private signingAuthority(session: AccountSession, key: CryptoKey) {
    return authoritySignature(key, () => this.assertSession(session));
  }
  async withVault<T>(
    offline: boolean,
    work: (authority: VaultAuthority) => Promise<T>,
    options: VaultWorkOptions = {},
  ): Promise<T> {
    return this.run(async (session, turn) => {
      await this.loadIdentity(session);
      if (offline) await this.restoreOffline(session);
      else if (!this.reusesTurnDirectory(turn))
        await measureWork(this, 'authority/directory', () =>
          this.synchronize(session),
        );
      if (!this.current || !this.ring || !this.identity)
        throw new Error('Authorize or recover this device to open the vault.');
      const ring = this.ring;
      const signing = this.identity.signing;
      const wrapping = this.identity.wrapping;
      const keys = new AuthorityKeys(
        (epoch) => {
          const secret = ring.keys[epoch - 1];
          if (!secret) throw new Error('Key epoch unavailable.');
          return secret;
        },
        () => this.assertSession(session),
      );
      const authority: VaultAuthority = {
        session,
        offline,
        directory: await eventHash(this.current),
        epoch: ring.epoch,
        events: [...this.events],
        key: (epoch) => keys.key(epoch),
        sign: this.signingAuthority(session, signing),
        openSecret: async (envelope, context) => {
          this.assertSession(session);
          const value = await openFrom(wrapping, envelope, context);
          this.assertSession(session);
          return value;
        },
      };
      try {
        const result = await work(authority);
        this.assertSession(session);
        return result;
      } finally {
        keys.dispose();
      }
    }, options);
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
          'No verified local authorization. Sign in and recover this device.',
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
          if (!secret) throw new Error('Key epoch unavailable.');
          return aesKey(secret);
        },
        sign: (proof) => sign(identity.signing, proof),
      });
    });
  }
  private async restoreOffline(session: AccountSession): Promise<void> {
    this.directoryReadAt = null;
    this.verified = null;
    const checkpoint = await readCheckpoint(session.accountId);
    const current = await verifyHistory(checkpoint.events, session.accountId);
    if (
      !current ||
      !this.identity ||
      checkpoint.trustedRoot !== (await digest(canonical(current.root)))
    )
      throw new Error('No verified local authorization. Connect to recover.');
    this.ring = await deviceSecrets(this.identity, current);
    this.current = current;
    this.events = checkpoint.events;
    this.trustedRoot = checkpoint.trustedRoot;
  }
  private async synchronize(session: AccountSession): Promise<void> {
    this.assertSession(session);
    const generation = this.generation;
    try {
      await this.readDirectory(session, generation);
    } catch (error: unknown) {
      // A failed read withdraws only this session's authority. A replacement
      // session may have completed its own verification while this read waited.
      if (generation === this.generation) {
        this.ring = null;
        this.directoryReadAt = null;
        this.verified = null;
      }
      throw error;
    }
  }
  private async readDirectory(
    session: AccountSession,
    generation: number,
  ): Promise<void> {
    const checkpoint = await readCheckpoint(session.accountId);
    const { current, events, serverTime } = await fetchDirectory(
      session,
      checkpoint.events,
    );
    if (generation !== this.generation) throw new Error('Session changed.');
    const trustedRoot = await this.reconciledRoot(checkpoint, current);
    const persist =
      trustedRoot === checkpoint.trustedRoot
        ? saveCheckpoint
        : advanceCheckpoint;
    await persist(session.accountId, { events, trustedRoot });
    const authority = await this.directoryAuthority(
      session,
      current,
      trustedRoot,
    );
    const verified =
      authority.ring && current
        ? { directory: await eventHash(current), events: events.length }
        : null;
    this.assertSession(session);
    if (generation !== this.generation) throw new Error('Session changed.');
    this.publishDirectory({
      current,
      events,
      serverTime,
      trustedRoot,
      ...authority,
      verified,
    });
  }
  /** Publish one complete snapshot; pending reads retain the last verified view. */
  private publishDirectory(input: {
    current: DirectoryEvent | null;
    events: DirectoryEvent[];
    serverTime: string;
    trustedRoot: string | null;
    ring: Keyring | null;
    keysLost: boolean;
    verified: { directory: string; events: number } | null;
  }): void {
    this.current = input.current;
    this.serverTime = input.serverTime;
    this.events = input.events;
    this.trustedRoot = input.trustedRoot;
    this.ring = input.ring;
    this.keysLost = input.keysLost;
    this.directoryReadAt = input.ring ? performance.now() : null;
    this.verified = input.verified;
    if (
      this.receiptTarget &&
      !input.current?.devices.some((device) => device.id === this.receiptTarget)
    ) {
      this.receipt = '';
      this.receiptTarget = null;
    }
    if (input.verified) this.signingLane.verifiedChanged();
  }
  /** Derive authority against the pending root without publishing partial state. */
  private async directoryAuthority(
    session: AccountSession,
    current: DirectoryEvent | null,
    trustedRoot: string | null,
  ): Promise<{ ring: Keyring | null; keysLost: boolean }> {
    const identity = this.identity;
    const listed = current?.devices.find(
      (device) => device.id === session.deviceId,
    );
    const rootTrusted =
      current !== null &&
      trustedRoot === (await digest(canonical(current.root)));
    this.assertSession(session);
    const keysLost = deviceKeysLost({
      local: identity?.public,
      listed,
      rootTrusted,
      rootPinned: trustedRoot !== null,
    });
    if (!current || !identity || !listed || !rootTrusted || keysLost)
      return { ring: null, keysLost };
    return { ring: await deviceSecrets(identity, current), keysLost };
  }
  private async reconciledRoot(
    checkpoint: { events: DirectoryEvent[]; trustedRoot: string | null },
    current: DirectoryEvent | null,
  ): Promise<string | null> {
    const previous = checkpoint.events.at(-1);
    if (!current || !previous) return checkpoint.trustedRoot;
    if (checkpoint.trustedRoot !== (await digest(canonical(previous.root))))
      return checkpoint.trustedRoot;
    return digest(canonical(current.root));
  }
  async privateKey(
    session: AccountSession,
  ): Promise<{ key: CryptoKey; epoch: number } | null> {
    this.setSession(session);
    return this.run(async (current) => {
      // Generate and durably store identity before any public grant is sent.
      await this.loadIdentity(current);
      await this.synchronize(current);
      await this.restoreWalletPending(current);
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
  private restoreWalletPending(session: AccountSession): Promise<void> {
    return this.walletRecovery.restore(session);
  }
  beginWalletRecovery(input: WalletRecoveryStart): Promise<boolean> {
    return this.walletRecovery.begin(input);
  }
  async completeLoginOpening(proof: {
    config: WalletRecovery;
    count: 1 | 2;
    signatures: string[];
  }): Promise<void> {
    try {
      await this.run(async (session) => {
        await this.loadIdentity(session);
        await this.synchronize(session);
        recoveryIdentity(proof.config, session, applicationOrigin());
        const previous = this.current;
        if (
          proof.count !== (previous ? 1 : 2) ||
          (previous &&
            canonical(previous.root.wallet) !== canonical(proof.config))
        )
          throw new Error('Recovery changed during sign-in. Start again.');
        const generation = this.generation;
        const plan: RecoveryPlan = {
          mode: previous ? 'recover' : 'initialize',
          config: proof.config,
          name: t('My device'),
          revoked: previous ? await this.recoveryRevocations(session, []) : [],
          revision: previous?.revision ?? 0,
          head: previous ? await eventHash(previous) : null,
        };
        await this.completeWalletRecovery({
          session,
          plan,
          signatures: proof.signatures,
          legacy: '',
          current: () => {
            this.assertSession(session);
            if (generation !== this.generation)
              throw new Error('Sign-in interrupted.');
          },
        });
      });
    } finally {
      proof.signatures.fill('');
    }
  }
  private async walletPlan(
    session: AccountSession,
    input: WalletRecoveryStart,
  ): Promise<RecoveryPlan> {
    await this.loadIdentity(session, input.name);
    await this.synchronize(session);
    if (this.walletPending)
      throw new Error('Complete or cancel the previous recovery request.');
    this.validateWalletMode(input.mode, input.revision);
    if (input.mode === 'migrate') {
      if (!input.legacy || !this.current)
        throw new Error(
          'Enter the old code one last time to authorize migration.',
        );
      await recoverSecrets(this.current, input.legacy);
    }
    const config = this.walletConfig(session, input.mode);
    const plan: RecoveryPlan = {
      mode: input.mode,
      config,
      name: input.name,
      revoked:
        input.mode === 'recover'
          ? await this.recoveryRevocations(session, input.revoked)
          : [...input.revoked],
      revision: this.current ? this.current.revision : 0,
      head: this.current ? await eventHash(this.current) : null,
    };
    return plan;
  }
  /** Recovery adds exactly one new device, so this one must not be listed yet;
   * refuse here, before the wallet is asked to sign. Devices whose keys this
   * browser lost leave the directory in the same event. */
  private async recoveryRevocations(
    session: AccountSession,
    selected: string[],
  ): Promise<string[]> {
    if (!this.current) throw new Error('Directory missing.');
    if (this.current.devices.some((device) => device.id === session.deviceId))
      throw new Error(
        this.keysLost
          ? 'This browser lost its device key. Select Complete sign-in and confirm with your wallet.'
          : 'This device is already in the account. Refresh to check its access.',
      );
    const lost = await lostDevices(session.accountId, this.current);
    return [...new Set([...selected, ...lost])];
  }
  private walletConfig(session: AccountSession, mode: RecoveryPlan['mode']) {
    const config =
      mode === 'recover'
        ? this.current?.root.wallet
        : createWalletRecovery(session, applicationOrigin());
    if (!config)
      throw new Error(
        'This account still uses the old code. Recover or migrate through the legacy flow.',
      );
    recoveryIdentity(config, session, applicationOrigin());
    return config;
  }
  private validateWalletMode(
    mode: RecoveryPlan['mode'],
    revision: number,
  ): void {
    if (mode === 'initialize') {
      if (this.current) throw new Error('Recovery is already configured.');
      return;
    }
    if (!this.current || this.current.revision !== revision)
      throw new Error('The device list changed. Review your choice again.');
    if (mode === 'migrate' && (!this.authorized || this.current.root.wallet))
      throw new Error(
        'Migration requires an authorized device and old configuration.',
      );
  }
  openWalletRecovery(): void {
    this.walletRecovery.open();
  }
  expireWalletRecovery(): boolean {
    return this.walletRecovery.expire();
  }
  finishWalletRecovery(legacy = ''): Promise<boolean> {
    return this.walletRecovery.finish(legacy);
  }
  cancelWalletRecovery(): Promise<void> {
    return this.walletRecovery.cancel();
  }
  private async completeWalletRecovery(
    input: RecoveryCompletion,
  ): Promise<void> {
    const { session, plan, signatures, current } = input;
    try {
      current();
      const previous = this.current;
      const key = await walletRecoveryKey(plan.config, signatures);
      const { authority, ring } = await this.walletAuthority(
        session,
        plan,
        key,
        input.legacy,
      );
      const identities = this.walletIdentities(plan);
      const profile = await this.rotatedProfile(session, ring);
      const event = await prepareEvent({
        accountId: session.accountId,
        previous,
        kind: plan.mode,
        signer: 'recovery',
        signing: authority.signing,
        root: authority.root,
        identities,
        ring,
        profile,
      });
      const restored = await recoverSecrets(
        event,
        await walletRecoveryKey(plan.config, [signatures.at(-1) ?? '']),
      );
      if (canonical(restored.ring) !== canonical(ring))
        throw new Error('Recovery verification failed.');
      current();
      await this.commit(session, event, profile);
    } finally {
      signatures.fill('');
      this.walletRecovery.clearLegacy();
    }
  }
  private async walletAuthority(
    session: AccountSession,
    plan: RecoveryPlan,
    key: CryptoKey,
    legacy: string,
  ) {
    if (!this.current)
      return {
        authority: await createRecovery(session.accountId, key, plan.config),
        ring: freshKeyring(session.accountId),
      };
    const recovered = await recoverSecrets(
      this.current,
      plan.mode === 'migrate' ? legacy : key,
    );
    this.ring = recovered.ring;
    const root =
      plan.mode === 'recover'
        ? this.current.root
        : (await createRecovery(session.accountId, key, plan.config)).root;
    return {
      authority: { root, signing: recovered.signing },
      ring: freshKeyring(session.accountId, recovered.ring),
    };
  }
  private walletIdentities(plan: RecoveryPlan) {
    if (!this.identity) throw new Error('Local identity missing.');
    if (plan.mode === 'initialize') return [this.identity.public];
    if (!this.current) throw new Error('Directory missing.');
    if (plan.mode === 'migrate') return this.current.devices.map(identityOf);
    return [
      ...recoveryIdentities(this.current, plan.revoked),
      this.identity.public,
    ];
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
      'Recovery incomplete: the old profile cannot open on this device. Configure it in the browser holding the profile key.',
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
    if (event.kind !== 'migrate')
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
        'Authorization confirmation does not match. Refresh to check the saved state.',
      );
    if (generation !== this.generation) throw new Error('Session changed.');
    const events = [...this.events, event];
    const persist =
      event.kind === 'migrate' ? advanceCheckpoint : saveCheckpoint;
    await persist(session.accountId, { events, trustedRoot });
    this.events = events;
    this.current = event;
    this.trustedRoot = trustedRoot;
    if (this.identity && trustedRoot)
      this.ring = await deviceSecrets(this.identity, event);
    this.receipt =
      event.kind === 'link' ? (await eventHash(event)).slice(0, 32) : '';
  }
  startLink(name: string): Promise<void> {
    return this.linking.start(name);
  }
  inspectCode(serialized: string): Promise<string> {
    return this.linking.inspect(serialized);
  }
  approveLink(): Promise<void> {
    return this.linking.approve();
  }
  finishLink(receipt: string): Promise<void> {
    return this.linking.finish(receipt);
  }
  cancelLink(): Promise<void> {
    return this.linking.cancel();
  }
  private async prepareLink(
    session: AccountSession,
    name: string,
  ): Promise<{ code: LinkCode; remaining: number }> {
    await this.synchronize(session);
    if (this.authorized) throw new Error('This device is already authorized.');
    await this.loadIdentity(session, name || t('New device'));
    if (!this.identity) throw new Error('Local identity missing.');
    const code: LinkCode = {
      version: 1,
      accountId: session.accountId,
      id: crypto.randomUUID(),
      nonce: await digest(newSecret()),
      expiresAt: new Date(Date.parse(this.serverTime) + 300_000).toISOString(),
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
      throw new Error('Invalid linking deadline.');
    return { code, remaining };
  }
  private async inspectLink(
    session: AccountSession,
    serialized: string,
  ): Promise<LinkCode> {
    await this.synchronize(session);
    if (!this.authorized)
      throw new Error('Use an authorized device to approve.');
    if (serialized.length > 4096) throw new Error('Code exceeds the limit.');
    const code = linkCode(JSON.parse(serialized) as unknown);
    await api(session, 'devices/inspect', code);
    return code;
  }
  private async authorizeLink(
    session: AccountSession,
    code: LinkCode | null,
  ): Promise<void> {
    await this.synchronize(session);
    if (!code || !this.current || !this.ring || !this.identity)
      throw new Error('Check a valid code before authorizing.');
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
  }
  private async confirmLink(
    session: AccountSession,
    pending: LinkCode | null,
    receipt: string,
  ): Promise<void> {
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
        'Confirmation code does not match. Check it on the authorizing device.',
      );
    const ring = await deviceSecrets(this.identity, this.current);
    const trustedRoot = await digest(canonical(this.current.root));
    await saveCheckpoint(session.accountId, {
      events: this.events,
      trustedRoot,
    });
    this.trustedRoot = trustedRoot;
    this.ring = ring;
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
        throw new Error('Choose another authorized device to revoke.');
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
        throw new Error('This account does not have a recovery key yet.');
      if (this.current.revision !== input.revision)
        throw new Error('The device list changed. Review your choice again.');
      const retained = recoveryIdentities(this.current, input.revoked);
      await this.loadIdentity(session, input.name || t('Recovered device'));
      if (!this.identity) throw new Error('Local identity missing.');
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
        throw new Error('Devices changed. Reload the profile before saving.');
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
    this.walletRecovery.reset();
    this.linking.reset();
    this.ring = null;
    this.receipt = '';
    this.receiptTarget = null;
  }
}
