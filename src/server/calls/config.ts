import { createHmac, randomBytes } from 'node:crypto';
export interface TurnConfig {
  urls: string[];
  secret: string;
  maxCalls: number;
}
export function readTurnConfiguration(
  env: NodeJS.ProcessEnv,
): TurnConfig | null {
  const raw = env['HASH_TALK_TURN_URLS'];
  const secret = env['HASH_TALK_TURN_SECRET'];
  if (!raw && !secret) return null;
  if (!raw || !secret) throw new Error('Configuração TURN incompleta.');
  if (!/^[A-Za-z0-9+/=_-]{43,128}$/u.test(secret))
    throw new Error('Segredo TURN inválido.');
  const urls = parseUrls(raw);
  return { urls, secret, maxCalls: capacity(env['HASH_TALK_CALL_CAPACITY']) };
}
function parseUrls(raw: string): string[] {
  const urls = raw.split(',');
  if (!urls.length || urls.length > 4 || new Set(urls).size !== urls.length)
    throw new Error('URLs TURN inválidas.');
  for (const url of urls) validateUrl(url);
  return urls;
}
function capacity(value: string | undefined): number {
  const maxCalls = Number(value ?? 16);
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 128)
    throw new Error('Capacidade de chamadas inválida.');
  return maxCalls;
}
function validateUrl(url: string): void {
  if (
    !/^turns?:[a-zA-Z0-9.-]+:\d{2,5}\?transport=(?:udp|tcp)$/u.test(url) ||
    (url.startsWith('turns:') && !url.endsWith('transport=tcp'))
  )
    throw new Error(
      'Use somente endpoints TURN próprios com porta/transporte explícitos.',
    );
  const port = Number(url.match(/:(\d+)\?/u)?.[1]);
  if (port < 1 || port > 65535) throw new Error('Porta TURN inválida.');
}
/** TURN REST authentication; random suffix has no account/device identifier. */
export function turnCredentials(config: TurnConfig, now = Date.now()) {
  const expires = Math.floor(now / 1000) + 600;
  const username = `${expires}:${randomBytes(18).toString('base64url')}`;
  return {
    expiresAt: expires * 1000,
    iceServers: [
      {
        urls: config.urls,
        username,
        credential: createHmac('sha1', config.secret)
          .update(username)
          .digest('base64'),
      },
    ],
  };
}
