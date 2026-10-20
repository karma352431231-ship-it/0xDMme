import { createHmac, randomBytes } from 'node:crypto';
export interface TurnConfig {
  urls: string[];
  secret: string;
}
export function readTurnConfiguration(
  env: NodeJS.ProcessEnv,
): TurnConfig | null {
  const raw = env['HASH_TALK_TURN_URLS'];
  const secret = env['HASH_TALK_TURN_SECRET'];
  if (!raw && !secret) return null;
  if (!raw || !secret) throw new Error('Incomplete TURN configuration.');
  if (!/^[A-Za-z0-9+/=_-]{43,128}$/u.test(secret))
    throw new Error('Invalid TURN secret.');
  const urls = parseUrls(raw);
  return { urls, secret };
}
function parseUrls(raw: string): string[] {
  const urls = raw.split(',');
  if (!urls.length || urls.length > 4 || new Set(urls).size !== urls.length)
    throw new Error('Invalid TURN URLs.');
  for (const url of urls) validateUrl(url);
  return urls;
}
function validateUrl(url: string): void {
  if (
    !/^turns?:[a-zA-Z0-9.-]+:\d{2,5}\?transport=(?:udp|tcp)$/u.test(url) ||
    (url.startsWith('turns:') && !url.endsWith('transport=tcp'))
  )
    throw new Error(
      'Use only self-hosted TURN endpoints with an explicit port and transport.',
    );
  const port = Number(url.match(/:(\d+)\?/u)?.[1]);
  if (port < 1 || port > 65535) throw new Error('Invalid TURN port.');
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
