import type { PushJob } from '../../src/server/database/index.ts';

export function pushJob(account: string = crypto.randomUUID()): PushJob {
  const device = crypto.randomUUID();
  return {
    account_id: account,
    device_id: device,
    generation: '1',
    attempts: 0,
    subscription: {
      endpoint: `https://web.push.apple.com/synthetic/${device}`,
      keys: { p256dh: 'synthetic', auth: 'synthetic' },
    },
  };
}
