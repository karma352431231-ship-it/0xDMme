import { request } from 'node:http';
import type { PushRegistration } from '../../shared/daily/index.ts';
import { pushDispatch } from './protocol.ts';
import type { PushDelivery } from './protocol.ts';

export interface PushClientConfiguration {
  publicKey: string;
  socketPath: string;
  token: string;
}
export function readPushClientConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): PushClientConfiguration | null {
  const publicKey = env['HASH_TALK_PUSH_PUBLIC_KEY'],
    socketPath = env['HASH_TALK_PUSH_SOCKET'],
    token = env['HASH_TALK_PUSH_TOKEN'];
  if (env['HASH_TALK_PUSH_PRIVATE_KEY'])
    throw new Error('Private VAPID key belongs only to the sender.');
  if (!publicKey && !socketPath && !token) return null;
  if (!publicKey || !/^[A-Za-z0-9_-]{87}$/u.test(publicKey))
    throw new Error('Invalid push public key.');
  validatePushSocket(socketPath);
  validatePushToken(token);
  return { publicKey, socketPath: socketPath!, token: token! };
}
export function validatePushSocket(input: string | undefined): void {
  if (
    !input ||
    !/^\/[A-Za-z0-9_/.-]{1,98}$/u.test(input) ||
    input.includes('..')
  )
    throw new Error('Invalid push socket.');
}
export function validatePushToken(input: string | undefined): void {
  if (!input || !/^[A-Za-z0-9_-]{43}$/u.test(input))
    throw new Error('Invalid internal push credential.');
}
/** Unix socket only: web never falls back to direct HTTPS or retains private VAPID. */
export function dispatchPush(
  config: PushClientConfiguration,
  subscription: PushRegistration,
  delivery: PushDelivery = {
    expiresAt: Date.now() + 60_000,
    urgency: 'normal',
  },
): Promise<void> {
  const body = JSON.stringify(pushDispatch({ subscription, ...delivery }));
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: config.socketPath,
        path: '/send',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'X-Push-Key': config.publicKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        signal: AbortSignal.timeout(9000),
        agent: false,
      },
      (response) => {
        response.resume();
        response.once('error', reject);
        response.once('end', () => {
          if (
            response.statusCode === 204 &&
            response.headers['x-push-key'] === config.publicKey
          ) {
            resolve();
            return;
          }
          reject(
            Object.assign(new Error('Push sender unavailable.'), {
              statusCode: response.statusCode ?? 503,
            }),
          );
        });
      },
    );
    req.once('error', reject);
    req.end(body);
  });
}
