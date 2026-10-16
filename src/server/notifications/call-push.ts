import type { DailyStore, PushJob } from '../database/index.ts';
import type { PushDelivery } from '../push-sender/index.ts';
import type { PushRegistration } from '../../shared/daily/index.ts';
import { reserveOperationMemory } from '../memory-admission/index.ts';

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
  release: () => void;
  timer: ReturnType<typeof setTimeout> | null;
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
  private readonly runningKeys = new Set<string>();
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
    const prepared = this.admit(jobs, invitation);
    for (const [key, pending] of prepared) {
      const previous = this.pending.get(key);
      if (previous) this.retire(key, previous);
      this.pending.set(key, pending);
      this.start(key, pending);
    }
  }
  private admit(
    jobs: PushJob[],
    invitation: CallInvitation,
  ): Map<string, Pending> {
    const prepared = new Map<string, Pending>();
    try {
      for (const job of jobs) {
        const key = `${job.account_id}:${job.device_id}`;
        if (prepared.has(key)) continue;
        const release = reserveOperationMemory(1_048_576);
        if (!release)
          throw new Error(
            'Orçamento temporário de avisos de chamada excedido.',
          );
        prepared.set(key, {
          job,
          invitation,
          attempts: 0,
          due: 0,
          active: false,
          release,
          timer: null,
        });
      }
      return prepared;
    } catch (error: unknown) {
      for (const pending of prepared.values()) pending.release();
      throw error;
    }
  }
  private start(key: string, pending: Pending): void {
    if (this.stopped || pending.invitation.deadline <= Date.now()) {
      this.retire(key, pending);
      return;
    }
    this.arm(key, pending, pending.invitation.deadline);
    if (pending.active || this.runningKeys.has(key)) return;
    pending.active = true;
    this.runningKeys.add(key);
    const work = this.dispatch(pending).finally(() => {
      pending.active = false;
      this.running.delete(work);
      this.runningKeys.delete(key);
      this.finished(key, pending);
    });
    this.running.add(work);
  }
  private finished(key: string, pending: Pending): void {
    if (
      this.stopped ||
      this.pending.get(key) !== pending ||
      !pending.due ||
      pending.invitation.deadline <= Date.now()
    ) {
      this.retire(key, pending);
    } else {
      this.arm(key, pending, pending.due);
    }
    const replacement = this.pending.get(key);
    if (replacement && replacement !== pending) this.start(key, replacement);
  }
  private arm(key: string, pending: Pending, at: number): void {
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(
      () => {
        pending.timer = null;
        this.start(key, pending);
      },
      Math.max(1, at - Date.now()),
    );
    pending.timer.unref();
  }
  private retire(key: string, pending: Pending): void {
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = null;
    if (this.pending.get(key) === pending) this.pending.delete(key);
    if (!pending.active) pending.release();
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
    for (const [key, pending] of this.pending)
      if (!pending.active && pending.due <= Date.now())
        this.start(key, pending);
    while (this.running.size) await Promise.all(this.running);
  }
  async close(): Promise<void> {
    this.stopped = true;
    for (const [key, pending] of this.pending) this.retire(key, pending);
    await Promise.all(this.running);
  }
}
function subscriptionGone(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('statusCode' in error))
    return false;
  return error.statusCode === 404 || error.statusCode === 410;
}
