import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  dailyPreferences,
  pushRegistration,
  pushPreferences,
} from '../../shared/daily/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type {
  ContactAuthority,
  DailyStore,
  DeviceStore,
  PushJob,
} from '../database/index.ts';
import type { PushDelivery, PushConfiguration } from '../push-sender/index.ts';
export {
  readPushConfiguration,
  publicPushAddress,
} from '../push-sender/index.ts';
export type { PushConfiguration } from '../push-sender/index.ts';
export type PushSend = (
  subscription: import('../../shared/daily/index.ts').PushRegistration,
  config: Pick<PushConfiguration, 'publicKey'>,
  delivery?: PushDelivery,
) => Promise<void>;
import { CallPushQueue } from './call-push.ts';
import type { CallInvitation } from './call-push.ts';

export class NotificationService {
  private readonly store: DailyStore;
  private readonly devices: DeviceStore;
  private readonly config: Pick<PushConfiguration, 'publicKey'> | null;
  private readonly send: PushSend;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private readonly calls: CallPushQueue;
  private incoming: (
    session: AccountSession,
    directory: string,
  ) => Promise<boolean> = () => Promise.resolve(false);
  constructor(options: {
    store: DailyStore;
    devices: DeviceStore;
    config: Pick<PushConfiguration, 'publicKey'> | PushConfiguration | null;
    send?: PushSend;
  }) {
    this.store = options.store;
    this.devices = options.devices;
    this.config = options.config;
    this.send =
      options.send ??
      (() => Promise.reject(new Error('Emissor push indisponível.')));
    this.calls = new CallPushQueue(this.store, (subscription, delivery) => {
      if (!this.config) return Promise.reject(new Error('Push indisponível.'));
      return this.send(subscription, this.config, delivery);
    });
  }
  async operate(
    a: ContactAuthority,
    operation: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const actions: Record<string, () => Promise<unknown>> = {
      'daily-config': () => {
        keys(input, []);
        return Promise.resolve({ publicKey: this.config?.publicKey ?? null });
      },
      'daily-push-state': () => {
        keys(input, []);
        return this.store.pushPreferences(a);
      },
      'daily-push-configure': () => {
        keys(input, ['preferences']);
        return this.store.configurePush(
          a,
          pushPreferences(input['preferences']),
        );
      },
      'daily-state': () => {
        keys(input, ['peer']);
        return this.store.state(a, uuid(input['peer']));
      },
      'daily-states': () => {
        keys(input, ['peers']);
        if (!Array.isArray(input['peers']) || input['peers'].length > 16)
          throw new AccountError(400, 'Lote inválido.');
        return this.store.states(a, input['peers'].map(uuid));
      },
      'daily-configure': () => {
        keys(input, ['revision', 'preferences']);
        return this.store.configure(
          a,
          integer(input['revision'], 2147483647),
          dailyPreferences(input['preferences']),
        );
      },
      'daily-mute': () => {
        keys(input, ['peer', 'revision', 'mutedUntil']);
        return this.store.mute(a, uuid(input['peer']), {
          revision: integer(input['revision'], 2147483647),
          mutedUntil: integer(input['mutedUntil'], Number.MAX_SAFE_INTEGER),
        });
      },
      'daily-heartbeat': () => {
        keys(input, ['active']);
        if (typeof input['active'] !== 'boolean')
          throw new AccountError(400, 'Estado inválido.');
        return this.store.heartbeat(a, input['active']);
      },
      'daily-read': () => {
        keys(input, ['peer', 'ids']);
        return this.store.read(
          a,
          uuid(input['peer']),
          messageIds(input['ids']),
        );
      },
      'daily-receipts': () => {
        keys(input, ['ids']);
        return this.store.receipts(a, messageIds(input['ids']));
      },
      'daily-subscribe': () => {
        keys(input, ['subscription']);
        if (input['subscription'] !== null && !this.config)
          throw new AccountError(
            503,
            'Push ainda não configurado neste ambiente.',
          );
        return this.store.subscribe(
          a,
          input['subscription'] === null
            ? null
            : pushRegistration(input['subscription']),
        );
      },
    };
    const action = Object.hasOwn(actions, operation)
      ? actions[operation]
      : undefined;
    if (!action) throw new AccountError(404, 'Operação diária indisponível.');
    return action();
  }
  async allowPush(session: AccountSession): Promise<boolean> {
    return (await this.inspectPush(session)).allowed;
  }
  bindCalls(
    incoming: (session: AccountSession, directory: string) => Promise<boolean>,
  ): void {
    this.incoming = incoming;
  }
  async wake(invitation: CallInvitation): Promise<void> {
    if (this.config && !this.stopped) await this.calls.enqueue(invitation);
  }
  async flushCalls(): Promise<void> {
    await this.calls.flush();
  }
  async inspectPush(
    session: AccountSession,
  ): Promise<{ allowed: boolean; call: boolean; showCall: boolean }> {
    const current = await this.devices.current(session.accountId);
    if (!current) return { allowed: false, call: false, showCall: false };
    const authority = { session, directory: current.head };
    const state = await this.store.pushState(authority);
    const call =
      state.registered &&
      state.calls &&
      (await this.incoming(session, current.head));
    return {
      allowed: call || (await this.store.check(authority)),
      call,
      showCall: call && state.showCalls,
    };
  }
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush().catch(() => {
        process.stderr.write('Fila de notificações indisponível.\n');
      });
    }, 30000);
    this.timer.unref();
  }
  async flush(): Promise<void> {
    if (this.running) return this.running;
    if (this.stopped) return;
    this.running = this.dispatch();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }
  private async dispatch(): Promise<void> {
    for (const job of await this.store.jobs()) {
      if (this.stopped) return;
      await this.dispatchOne(job);
    }
  }
  private async dispatchOne(job: PushJob): Promise<void> {
    if (!this.config) return;
    if (!(await this.store.eligible(job))) {
      await this.store.finish(job, 'sent');
      return;
    }
    try {
      await this.send(job.subscription, this.config);
      await this.store.finish(job, 'sent');
    } catch (error: unknown) {
      const status = objectErrorStatus(error);
      await this.store.finish(
        job,
        status === 404 || status === 410 ? 'gone' : 'retry',
      );
    }
  }
  async close(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
    await this.calls.close();
  }
}
function objectErrorStatus(error: unknown): number {
  return typeof error === 'object' && error !== null && 'statusCode' in error
    ? Number(object(error)['statusCode'])
    : 0;
}

function messageIds(input: unknown): string[] {
  if (!Array.isArray(input) || input.length > 16)
    throw new AccountError(400, 'Lote inválido.');
  return input.map(uuid);
}
