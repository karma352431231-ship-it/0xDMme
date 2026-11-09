import { randomBytes } from 'node:crypto';

interface FixtureEndpoint {
  port: number;
  host: string;
  seed: string;
}

function port(value: string | undefined, fallback: number): number {
  const result = Number(value ?? fallback);
  if (!Number.isInteger(result) || result < 45111 || result > 45119)
    throw new Error('Browser fixture port is outside its test range.');
  return result;
}

function host(value: string): string {
  if (!['127.0.0.1', 'localhost'].includes(value))
    throw new Error('Browser fixture requires a loopback-only host.');
  return value;
}

function pairedHost(primary: string): string {
  return primary === '127.0.0.1' ? 'localhost' : '127.0.0.1';
}

function seed(value: string | undefined): string {
  const result = value ?? `0x${randomBytes(32).toString('hex')}`;
  if (!/^0x[a-f0-9]{64}$/u.test(result))
    throw new Error('Invalid synthetic fixture seed. Never use real keys.');
  return result;
}

/** Fixture-only identity/origin owner; validate both peers before database work. */
export function browserFixtureEndpoints(
  environment: Readonly<Record<string, string | undefined>>,
): { primary: FixtureEndpoint; paired?: FixtureEndpoint } {
  const primary = {
    port: port(environment['HASH_TALK_FIXTURE_PORT'], 45111),
    host: host(environment['HASH_TALK_FIXTURE_HOST'] ?? '127.0.0.1'),
    seed: seed(environment['HASH_TALK_FIXTURE_SYNTHETIC_SEED']),
  };
  if (!environment['HASH_TALK_FIXTURE_PAIR_PORT']) return { primary };
  const paired = {
    port: port(environment['HASH_TALK_FIXTURE_PAIR_PORT'], 45112),
    host: host(
      environment['HASH_TALK_FIXTURE_PAIR_HOST'] ?? pairedHost(primary.host),
    ),
    seed: seed(environment['HASH_TALK_FIXTURE_PAIR_SYNTHETIC_SEED']),
  };
  if (paired.port === primary.port || paired.host === primary.host)
    throw new Error('Paired fixtures require distinct ports and cookie hosts.');
  return { primary, paired };
}
