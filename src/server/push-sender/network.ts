import webpush from 'web-push';
import { Agent } from 'node:https';
import { lookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import {
  pushRegistration,
  genericNotification,
} from '../../shared/daily/index.ts';
import type { PushDelivery } from './protocol.ts';

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
  delivery: PushDelivery = {
    expiresAt: Date.now() + 60_000,
    urgency: 'normal',
  },
): Promise<void> {
  pushRegistration(subscription);
  const remaining = delivery.expiresAt - Date.now();
  const ttl = Math.floor(remaining / 1000);
  if (ttl <= 0 || ttl > 60) throw new Error('Aviso push expirado.');
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
  const timer = setTimeout(() => agent.destroy(), Math.min(8000, remaining));
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify(genericNotification),
      {
        vapidDetails: config,
        contentEncoding: 'aes128gcm',
        TTL: ttl,
        urgency: delivery.urgency,
        topic:
          delivery.urgency === 'high' ? '0xdmme-urgent' : '0xdmme-activity',
        timeout: Math.min(5000, remaining),
        agent,
      },
    );
  } finally {
    clearTimeout(timer);
    agent.destroy();
  }
}
