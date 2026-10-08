import type { DailyStore, PushJob } from '../database/index.ts';
import type { PushDelivery } from '../push-sender/index.ts';
import type { PushRegistration } from '../../shared/daily/index.ts';

export interface CallInvitation {
  account: string;
  devices: string[];
  deadline: number;
  valid: () => Promise<boolean>;
}
interface Pending {
  job: PushJob;
  invitation: CallInvitation;
  attempts: number;
  due: number;
  active: boolean;
}
/** Bounded volatile invitations; ordinary message retry markers remain independent. */
export class CallPushQueue {
  private readonly store: Pick<
    DailyStore,
    'callJobs' | 'callEligible' | 'retireCallSubscription'
  >;
  private readonly send: (
    subscription: PushRegistration,
    delivery: PushDelivery,
  ) => Promise<void>;
  private readonly pending = new Map<string, Pending>();
  private readonly running = new Set<Promise<void>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  constructor(
    store: Pick<
      DailyStore,
      'callJobs' | 'callEligible' | 'retireCallSubscription'
    >,
    send: (
      subscription: PushRegistration,
      delivery: PushDelivery,
    ) => Promise<void>,
  ) {
    this.store = store;
    this.send = send;
  }
  async enqueue(invitation: CallInvitation): Promise<void> {
    if (this.stopped || invitation.deadline <= Date.now()) return;
    const jobs = await this.store.callJobs(
      invitation.account,
      invitation.devices,
    );
    if (this.stopped) return;
    for (const job of jobs) {
      const key = `${job.account_id}:${job.device_id}`;
      if (this.pending.size >= 512 && !this.pending.has(key))
        throw new Error('Orçamento temporário de avisos de chamada excedido.');
      this.pending.set(key, {
        job,
        invitation,
        attempts: 0,
        due: 0,
        active: false,
      });
    }
    this.kick();
  }
  private kick(): void {
    if (this.stopped) return;
    for (const [key, pending] of this.pending) {
      if (pending.invitation.deadline <= Date.now()) {
        this.pending.delete(key);
        continue;
      }
      if (this.running.size >= 3) break;
      if (pending.active || pending.due > Date.now()) continue;
      pending.active = true;
      const work = this.dispatch(pending).finally(() => {
        pending.active = false;
        this.running.delete(work);
        if (!pending.due && this.pending.get(key) === pending)
          this.pending.delete(key);
        this.kick();
      });
      this.running.add(work);
    }
    this.schedule();
  }
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    let next = Infinity;
    for (const pending of this.pending.values()) {
      next = Math.min(next, pending.invitation.deadline);
      if (!pending.active && this.running.size < 3)
        next = Math.min(next, pending.due);
    }
    if (!Number.isFinite(next) || this.stopped) return;
    this.timer = setTimeout(() => this.kick(), Math.max(1, next - Date.now()));
    this.timer.unref();
  }
  private async dispatch(pending: Pending): Promise<void> {
    pending.due = 0;
    try {
      if (
        !(await pending.invitation.valid()) ||
        !(await this.store.callEligible(pending.job)) ||
        this.stopped
      )
        return;
      if (pending.invitation.deadline <= Date.now()) return;
      await this.send(pending.job.subscription, {
        expiresAt: pending.invitation.deadline,
        urgency: 'high',
      });
    } catch (error: unknown) {
      if (subscriptionGone(error)) {
        try {
          await this.store.retireCallSubscription(pending.job);
        } catch {
          this.retry(pending);
        }
        return;
      }
      this.retry(pending);
    }
  }
  private retry(pending: Pending): void {
    if (
      ++pending.attempts < 2 &&
      Date.now() + 3000 < pending.invitation.deadline
    )
      pending.due = Date.now() + 3000;
  }
  async flush(): Promise<void> {
    this.kick();
    while (this.running.size) await Promise.all(this.running);
  }
  async close(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.pending.clear();
    await Promise.all(this.running);
  }
}
function subscriptionGone(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('statusCode' in error))
    return false;
  return error.statusCode === 404 || error.statusCode === 410;
}
