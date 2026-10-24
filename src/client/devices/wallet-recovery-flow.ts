import { t } from '../../shared/i18n/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { LocalIdentity } from '../device-keys/index.ts';
import {
  directRecovery,
  requestRecovery,
  receiveRecovery,
  RecoveryReturnError,
  openRecoveryWallet,
  recoveryApi,
  rememberRecovery,
  readRecovery,
  forgetRecovery,
} from '../recovery-return/index.ts';
import type { RecoveryPlan, RecoveryFlow } from '../recovery-return/index.ts';
export interface WalletRecoveryStart {
  mode: RecoveryPlan['mode'];
  wallet: string;
  name: string;
  revoked: string[];
  revision: number;
  legacy?: string;
}
export interface RecoveryCompletion {
  session: AccountSession;
  plan: RecoveryPlan;
  signatures: string[];
  legacy: string;
  current: () => void;
}
interface RecoveryAuthority {
  session: () => AccountSession | null;
  run: <T>(operation: (session: AccountSession) => Promise<T>) => Promise<T>;
  plan: (
    session: AccountSession,
    input: WalletRecoveryStart,
  ) => Promise<RecoveryPlan>;
  loadIdentity: (session: AccountSession) => Promise<void>;
  receiver: () => Readonly<LocalIdentity> | null;
  validateSelection: (plan: RecoveryPlan) => void;
  verify: (session: AccountSession, flow: RecoveryFlow) => Promise<void>;
  lease: (session: AccountSession) => (message: string) => void;
  complete: (input: RecoveryCompletion) => Promise<void>;
}
/** Owns the temporary wallet-return request, expiry and in-memory legacy input.
 * Plans and commits come from one verified authority; no key ring or trust root
 * is copied into this workflow. Existing recovery-return code owns transport crypto. */
export class DeviceWalletRecovery {
  private readonly authority: RecoveryAuthority;
  private pending: RecoveryFlow | null = null;
  private legacy = '';
  constructor(authority: RecoveryAuthority) {
    this.authority = authority;
  }
  get flow(): RecoveryFlow | null {
    return this.pending;
  }
  /** Compatibility for the controller's existing public request metadata. It
   * carries no directory authorization or key-ring authority. */
  replaceFlow(flow: RecoveryFlow | null): void {
    this.pending = flow;
  }
  reset(): void {
    this.pending = null;
    this.legacy = '';
  }
  clearLegacy(): void {
    this.legacy = '';
  }
  async restore(session: AccountSession): Promise<void> {
    const receiver = this.authority.receiver();
    if (receiver && !this.pending)
      this.pending = await readRecovery(session, receiver.public.wrapping);
  }
  begin(input: WalletRecoveryStart): Promise<boolean> {
    return this.authority.run((session) =>
      this.start(session, { ...input, name: input.name || t('My device') }),
    );
  }
  private async start(
    session: AccountSession,
    input: WalletRecoveryStart,
  ): Promise<boolean> {
    const plan = await this.authority.plan(session, input);
    if (!this.authority.receiver()) throw new Error('Local identity missing.');
    this.authority.validateSelection(plan);
    const valid = this.authority.lease(session);
    const deadline = Date.now() + 120_000;
    const current = () => {
      valid('Request interrupted or expired. Start again.');
      if (Date.now() > deadline)
        throw new Error('Request interrupted or expired. Start again.');
    };
    const count = input.mode === 'recover' ? 1 : 2;
    const signatures = await directRecovery({
      config: plan.config,
      wallet: input.wallet,
      count,
      current,
    });
    if (signatures) {
      await this.authority.complete({
        session,
        plan,
        signatures,
        legacy: input.legacy ?? '',
        current,
      });
      return true;
    }
    if (!/Android|iPhone|iPad|iPod/iu.test(navigator.userAgent))
      throw new Error(
        'Wallet unavailable in this browser. Open a compatible wallet to sign.',
      );
    const pending = await requestRecovery({
      session,
      identity: this.authority.receiver()!,
      config: plan.config,
      wallet: input.wallet,
      count,
    });
    current();
    this.pending = { ...plan, pending };
    this.legacy = input.legacy ?? '';
    rememberRecovery(session, this.pending);
    return false;
  }
  open(): void {
    if (!this.pending) throw new Error('Recovery request missing.');
    openRecoveryWallet(this.pending.pending);
  }
  private forget(): void {
    const session = this.authority.session();
    if (session) forgetRecovery(session);
    this.pending = null;
    this.legacy = '';
  }
  expire(): boolean {
    if (!this.pending || this.pending.pending.deadline > Date.now())
      return false;
    this.forget();
    return true;
  }
  private async walletSignatures(
    session: AccountSession,
    flow: RecoveryFlow,
    identity: LocalIdentity,
  ): Promise<string[] | null> {
    try {
      return await receiveRecovery({
        session,
        identity,
        pending: flow.pending,
      });
    } catch (error: unknown) {
      // A missing/consumed server request cannot receive another result. Network
      // failures retain the live request so a valid signature can still return.
      if (
        error instanceof RecoveryReturnError &&
        error.status === 409 &&
        this.pending === flow
      )
        this.forget();
      throw error;
    }
  }
  async finish(legacy = ''): Promise<boolean> {
    if (this.expire())
      throw new Error('The wallet request expired. Open your account again.');
    return this.authority.run(async (session) => {
      await this.authority.loadIdentity(session);
      await this.restore(session);
      const flow = this.pending;
      if (!flow || !this.authority.receiver())
        throw new Error('Request missing. Start again.');
      await this.authority.verify(session, flow);
      const oldSecret = legacy || this.legacy;
      if (flow.mode === 'migrate' && !oldSecret)
        throw new Error(
          'Enter the old code one last time to authorize migration.',
        );
      const signatures = await this.walletSignatures(
        session,
        flow,
        this.authority.receiver()!,
      );
      if (!signatures) return false;
      const valid = this.authority.lease(session);
      const current = () => {
        valid('Session changed during recovery.');
        if (this.pending !== flow || Date.now() >= flow.pending.deadline)
          throw new Error('Session changed during recovery.');
      };
      await this.authority.complete({
        session,
        plan: flow,
        signatures,
        legacy: oldSecret,
        current,
      });
      forgetRecovery(session);
      this.pending = null;
      this.legacy = '';
      return true;
    });
  }
  async cancel(): Promise<void> {
    return this.authority.run(async (session) => {
      const flow = this.pending;
      forgetRecovery(session);
      this.pending = null;
      this.legacy = '';
      if (flow)
        await recoveryApi(
          'cancel',
          {
            ticket: flow.pending.transfer.ticket,
            commitment: flow.pending.commitment,
          },
          session,
        );
    });
  }
}
