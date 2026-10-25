import { t } from '../../shared/i18n/index.ts';
import {
  boundedText,
  object,
  accountSession,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { canonical, digest, linkCode } from '../../shared/devices/index.ts';
import type { LinkCode } from '../../shared/devices/index.ts';
import {
  readEnrollment,
  verifyEnrollmentMac,
} from '../../shared/device-enrollment/index.ts';
import type { EnrollmentCode } from '../../shared/device-enrollment/index.ts';
import { fetchApi, readApiJson } from '../api-response/index.ts';

interface LinkOperations {
  run: <T>(operation: (session: AccountSession) => Promise<T>) => Promise<T>;
  start: (
    session: AccountSession,
    name: string,
  ) => Promise<{ code: LinkCode; remaining: number }>;
  inspect: (session: AccountSession, serialized: string) => Promise<LinkCode>;
  authorize: (session: AccountSession, code: LinkCode | null) => Promise<void>;
  confirm: (
    session: AccountSession,
    pending: LinkCode | null,
    receipt: string,
  ) => Promise<void>;
  cancel: (session: AccountSession, code: LinkCode) => Promise<void>;
  enrollmentCandidate: (id: string) => Promise<unknown>;
}
/** Owns public linking drafts, selection, fingerprint and deadline. Verified
 * directory/key changes are complete operations of the existing authority. */
export class DeviceLinking {
  private readonly operations: LinkOperations;
  private pending: LinkCode | null = null;
  private approval: LinkCode | null = null;
  private fingerprint = '';
  private deadline = 0;
  constructor(operations: LinkOperations) {
    this.operations = operations;
  }
  get pendingCode(): LinkCode | null {
    return this.pending;
  }
  get approvalCode(): LinkCode | null {
    return this.approval;
  }
  get pendingFingerprint(): string {
    return this.fingerprint;
  }
  get expiresAt(): number {
    return this.deadline;
  }
  reset(): void {
    this.clear();
    this.approval = null;
  }
  resetSession(): void {
    this.reset();
    this.deadline = 0;
  }
  private clear(): void {
    this.pending = null;
    this.fingerprint = '';
  }
  start(name: string): Promise<void> {
    return this.operations.run(async (session) => {
      const { code, remaining } = await this.operations.start(session, name);
      this.pending = code;
      this.fingerprint = await digest(canonical(code.device));
      this.deadline = Date.now() + remaining;
    });
  }
  inspect(serialized: string): Promise<string> {
    return this.operations.run(async (session) => {
      const code = await this.operations.inspect(session, serialized);
      this.approval = code;
      return t('{0} · fingerprint {1}', [
        code.device.name,
        await digest(canonical(code.device)),
      ]);
    });
  }
  approve(): Promise<void> {
    return this.operations.run(async (session) => {
      const code = this.approval;
      await this.operations.authorize(session, code);
      this.approval = null;
    });
  }
  finish(receipt: string): Promise<void> {
    return this.operations.run(async (session) => {
      const pending = this.pending;
      await this.operations.confirm(session, pending, receipt);
      this.clear();
    });
  }
  cancel(): Promise<void> {
    return this.operations.run(async (session) => {
      if (this.pending) await this.operations.cancel(session, this.pending);
      this.clear();
      this.deadline = 0;
    });
  }
  async approveEnrollment(invitation: EnrollmentCode): Promise<boolean> {
    const candidate = await this.operations.enrollmentCandidate(invitation.id);
    if (candidate === null) return false;
    const data = object(candidate),
      code = linkCode(data['code']);
    if (
      code.accountId !== invitation.accountId ||
      code.expiresAt !== invitation.expiresAt
    )
      throw new Error('Linking request does not match.');
    await verifyEnrollmentMac(
      invitation.secret,
      code,
      boundedText(data['proof'], 64),
    );
    await this.inspect(canonical(code));
    await this.approve();
    return true;
  }
}

export async function joinDeviceEnrollment(
  serialized: string,
  prepare: (invitation: EnrollmentCode) => Promise<{
    deviceId: string;
    input: unknown;
  }>,
): Promise<AccountSession> {
  const invitation = readEnrollment(serialized);
  if (Date.parse(invitation.expiresAt) <= Date.now())
    throw new Error('Code expired.');
  const { deviceId, input } = await prepare(invitation);
  const response = await fetchApi(
    'account/enrollment-join',
    '/api/account/enrollment-join',
    {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(8000),
    },
  );
  const data = await readApiJson(response, 'account/enrollment-join');
  const session = accountSession(data);
  if (
    session.accountId !== invitation.accountId ||
    session.deviceId !== deviceId ||
    session.walletConfirmed
  )
    throw new Error('Session differs from the requested device linking.');
  return session;
}
