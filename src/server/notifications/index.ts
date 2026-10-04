import webpush from 'web-push';
import { Agent } from 'node:https';
import { lookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import {
  dailyPreferences,
  pushRegistration,
  genericNotification,
} from '../../shared/daily/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type {
  ContactAuthority,
  DailyStore,
  DeviceStore,
  PushJob,
} from '../database/index.ts';

export interface PushConfiguration {
  publicKey: string;
  privateKey: string;
  subject: string;
}
export function readPushConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): PushConfiguration | null {
  const publicKey = env['HASH_TALK_PUSH_PUBLIC_KEY'],
    privateKey = env['HASH_TALK_PUSH_PRIVATE_KEY'];
  if (!publicKey && !privateKey) return null;
  if (
    !publicKey ||
    !/^[A-Za-z0-9_-]{87}$/u.test(publicKey) ||
    !privateKey ||
    !/^[A-Za-z0-9_-]{43}$/u.test(privateKey)
  )
    throw new Error('Chaves VAPID inválidas.');
  const subject = 'https://0xdmme.app';
  webpush.getVapidHeaders(
    'https://web.push.apple.com',
    subject,
    publicKey,
    privateKey,
    'aes128gcm',
  );
  return { publicKey, privateKey, subject };
}
const privateNetworks = new BlockList();
const privateIPv6 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  privateNetworks.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 96],
  ['::ffff:0:0', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
] as const)
  privateIPv6.addSubnet(address, prefix, 'ipv6');
export function publicPushAddress(address: string): boolean {
  const family = isIP(address);
  return (
    family !== 0 &&
    !(family === 4 ? privateNetworks : privateIPv6).check(
      address,
      family === 4 ? 'ipv4' : 'ipv6',
    )
  );
}
export async function sendPush(
  subscription: import('../../shared/daily/index.ts').PushRegistration,
  config: PushConfiguration,
): Promise<void> {
  pushRegistration(subscription);
  const agent = new Agent({
    keepAlive: false,
    lookup(host, options, callback) {
      lookup(host, options, (error, address, family) => {
        if (error) {
          callback(error, address, family);
          return;
        }
        const valid = Array.isArray(address)
          ? address.every((a) => publicPushAddress(a.address))
          : publicPushAddress(address);
        if (!valid) {
          callback(new Error('Destino push indisponível.'), '', 4);
          return;
        }
        callback(null, address, family);
      });
    },
  });
  const timer = setTimeout(() => agent.destroy(), 8000);
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify(genericNotification),
      {
        vapidDetails: config,
        contentEncoding: 'aes128gcm',
        TTL: 60,
        urgency: 'normal',
        topic: '0xdmme-activity',
        timeout: 5000,
        agent,
      },
    );
  } finally {
    clearTimeout(timer);
    agent.destroy();
  }
}
export class NotificationService {
  private readonly store: DailyStore;
  private readonly devices: DeviceStore;
  private readonly config: PushConfiguration | null;
  private readonly send: typeof sendPush;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  constructor(options: {
    store: DailyStore;
    devices: DeviceStore;
    config: PushConfiguration | null;
    send?: typeof sendPush;
  }) {
    this.store = options.store;
    this.devices = options.devices;
    this.config = options.config;
    this.send = options.send ?? sendPush;
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
    const current = await this.devices.current(session.accountId);
    if (!current) return false;
    return this.store.check({ session, directory: current.head });
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
