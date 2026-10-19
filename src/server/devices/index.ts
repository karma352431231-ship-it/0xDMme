import {
  AccountError,
  keys,
  object,
  profileEnvelope,
  uuid,
  requireWalletSession,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  canonical,
  digest,
  directoryEvent,
  eventHash,
  fingerprint,
  identityOf,
  linkCode,
  linkProof,
  linkSeconds,
  profileProof,
  verify,
  verifyTransition,
} from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import type { DeviceStore } from '../database/index.ts';
import { recoveryIdentity } from '../../shared/wallet-recovery/index.ts';
import { enrollmentBody } from '../../shared/device-enrollment/index.ts';

export class DeviceService {
  async assertEnrollmentSource(
    session: AccountSession,
    head: string,
  ): Promise<void> {
    requireWalletSession(session);
    await this.store.assertEnrollmentSource(session, head);
  }
  async enrollmentSource(
    session: AccountSession,
    payload: { head: string; root: string },
    signature: string,
  ): Promise<void> {
    await this.assertEnrollmentSource(session, payload.head);
    const current = await this.current(session);
    const device = current?.devices.find((d) => d.id === session.deviceId);
    if (
      !current ||
      !device ||
      (await digest(canonical(current.root))) !== payload.root
    )
      throw new AccountError(403, 'Linking identity does not match.');
    await verify(
      device.signing,
      signature,
      enrollmentBody(session.accountId, session.deviceId, payload),
    );
  }
  private readonly store: DeviceStore;
  private readonly origin: string | undefined;
  constructor(store: DeviceStore, origin?: string) {
    this.store = store;
    this.origin = origin;
  }
  private async current(
    session: AccountSession,
  ): Promise<DirectoryEvent | null> {
    const current = await this.store.current(session.accountId);
    return current ? directoryEvent(current.event) : null;
  }
  async openingRecovery(accountId: string) {
    const row = await this.store.current(uuid(accountId));
    if (!row) return null;
    const current = directoryEvent(row.event);
    if (!current.root.wallet)
      throw new AccountError(
        409,
        'This account requires recovery through the old code or an authorized device.',
      );
    return current.root.wallet;
  }
  async read(session: AccountSession, input: unknown) {
    const data = object(input);
    keys(data, ['after']);
    const after = pageOffset(data['after']);
    // Page then head: a concurrent commit can require another page, never
    // make the page appear to belong to an older head.
    const events = await this.store.page(session.accountId, after);
    const current = await this.store.current(session.accountId);
    if (after > (current?.revision ?? 0))
      throw new AccountError(409, 'Directory outdated or incomplete.');
    return {
      events,
      serverTime: new Date().toISOString(),
      revision: current?.revision ?? 0,
      head: current?.head ?? null,
    };
  }
  async start(session: AccountSession, input: unknown) {
    const data = object(input);
    keys(data, ['code', 'signature']);
    const code = linkCode(data['code']);
    if (
      code.accountId !== session.accountId ||
      code.device.id !== session.deviceId
    )
      throw new AccountError(
        403,
        'Request belongs to another device or account.',
      );
    const current = await this.current(session);
    if (
      current?.devices.some((device) => device.id === session.deviceId) ||
      current?.revoked.includes(session.deviceId)
    )
      throw new AccountError(409, 'Use a new device registration for linking.');
    if (typeof data['signature'] !== 'string')
      throw new AccountError(400, 'Signature missing.');
    await verify(code.device.signing, data['signature'], linkProof(code));
    const expiresAt = linkDeadline(code.expiresAt);
    await this.store.createLink(session, {
      id: code.id,
      codeHash: await digest(canonical(code)),
      device: code.device,
      expiresAt,
    });
    return {
      expiresAt: expiresAt.toISOString(),
      serverTime: new Date().toISOString(),
    };
  }
  async inspect(session: AccountSession, input: unknown) {
    const code = linkCode(input);
    if (code.accountId !== session.accountId)
      throw new AccountError(403, 'Code belongs to another account.');
    const current = await this.current(session);
    if (!current?.devices.some((device) => device.id === session.deviceId))
      throw new AccountError(403, 'Device has no authorization.');
    const link = await this.store.link(session.accountId, code.id);
    if (
      link.codeHash !== (await digest(canonical(code))) ||
      canonical(link.device) !== canonical(code.device)
    )
      throw new AccountError(409, 'Code or keys do not match.');
    return {
      device: link.device,
      expiresAt: link.expiresAt.toISOString(),
      serverTime: new Date().toISOString(),
    };
  }
  async cancel(session: AccountSession, input: unknown) {
    const data = object(input);
    keys(data, ['id']);
    await this.store.cancelLink(session, uuid(data['id']));
    return { status: 'cancelled' };
  }
  async commit(session: AccountSession, input: unknown) {
    const data = object(input);
    keys(data, ['event', 'profile']);
    const previous = await this.current(session);
    const event = await verifyTransition(previous, data['event']);
    if (
      ['initialize', 'recover', 'migrate', 'link', 'revoke'].includes(
        event.kind,
      )
    )
      requireWalletSession(session);
    if (event.accountId !== session.accountId)
      throw new AccountError(403, 'Directory belongs to another account.');
    this.authorizeRecovery(session, event);
    this.authorizeCommit(session, previous, event);
    if (event.linkId) {
      const link = await this.store.link(session.accountId, event.linkId);
      if (
        previous?.devices.some((device) => device.id === link.device.id) ||
        !event.devices.some(
          (device) => canonical(identityOf(device)) === canonical(link.device),
        )
      )
        throw new AccountError(409, 'Device differs from the code.');
    }
    const profile =
      data['profile'] === null ? null : profileEnvelope(data['profile']);
    if ((profile ? await digest(canonical(profile)) : null) !== event.profile)
      throw new AccountError(400, 'Profile does not match the signed change.');
    const head = await eventHash(event);
    await this.store.commit({ session, event, head, profile });
    return { head, revision: event.revision };
  }
  private authorizeCommit(
    session: AccountSession,
    previous: DirectoryEvent | null,
    event: DirectoryEvent,
  ): void {
    if (
      event.kind === 'migrate' &&
      !previous?.devices.some((device) => device.id === session.deviceId)
    )
      throw new AccountError(403, 'Migration requires an authorized device.');
    if (event.signer !== 'recovery' && event.signer !== session.deviceId)
      throw new AccountError(403, 'Signature belongs to another device.');
    if (event.kind === 'initialize' || event.kind === 'recover') {
      if (!event.devices.some((device) => device.id === session.deviceId))
        throw new AccountError(403, 'Authorization belongs to another device.');
      requireFreshDevice(previous, session.deviceId);
    }
  }
  private authorizeRecovery(
    session: AccountSession,
    event: DirectoryEvent,
  ): void {
    if (event.root.wallet)
      recoveryIdentity(
        event.root.wallet,
        session,
        this.origin ?? event.root.wallet.origin,
      );
  }
  async saveProfile(session: AccountSession, input: unknown) {
    const data = object(input);
    keys(data, ['head', 'profile', 'signature']);
    const head = fingerprint(data['head']);
    const current = await this.current(session);
    const device = current?.devices.find(
      (device) => device.id === session.deviceId,
    );
    if (!device || !current || head !== (await eventHash(current)))
      throw new AccountError(403, 'Device has no current authorization.');
    const profile = profileEnvelope(data['profile']);
    if (typeof data['signature'] !== 'string')
      throw new AccountError(400, 'Signature missing.');
    await verify(
      device.signing,
      data['signature'],
      profileProof(session.accountId, session.deviceId, head, profile),
    );
    await this.store.saveProfile(session, head, profile);
    return { status: 'saved' };
  }
  async operate(
    path: string,
    session: AccountSession,
    input: unknown,
  ): Promise<unknown> {
    switch (path) {
      case 'read':
        return this.read(session, input);
      case 'start':
        return this.start(session, input);
      case 'inspect':
        return this.inspect(session, input);
      case 'cancel':
        return this.cancel(session, input);
      case 'commit':
        return this.commit(session, input);
      case 'profile':
        return this.saveProfile(session, input);
      default:
        throw new AccountError(404, 'Device operation not found.');
    }
  }
}
function pageOffset(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 128
  )
    throw new AccountError(400, 'Invalid page.');
  return value;
}
function linkDeadline(value: string): Date {
  const expiresAt = new Date(value);
  const remaining = expiresAt.getTime() - Date.now();
  if (remaining <= 0 || remaining > linkSeconds * 1000)
    throw new AccountError(
      409,
      'Code expired or deadline invalid. Create a new request.',
    );
  return expiresAt;
}
function requireFreshDevice(
  previous: DirectoryEvent | null,
  deviceId: string,
): void {
  if (
    previous?.devices.some((device) => device.id === deviceId) ||
    previous?.revoked.includes(deviceId)
  )
    throw new AccountError(
      409,
      'Recovery requires a new device without reusing a revoked identity.',
    );
}
