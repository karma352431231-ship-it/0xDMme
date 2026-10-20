import { resolve, sep } from 'node:path';
import { readPreparationProfile } from '../configuration/index.ts';

export interface WebConfiguration {
  profile: 'development' | 'staging';
  port: number;
  socketPath?: string;
  origin: string;
  databaseUrl: string;
  objectDirectory: string;
  contentCapacity:
    { mode: 'fixed'; bytes: number } | { mode: 'volume'; directory: string };
  walletConnectProjectId?: string;
  /** KLIPY key for the GIF tab (owner decision 09/10/2026); absent disables it. */
  gifSearchKey?: string;
}

function validateDatabase(databaseUrl: string): URL {
  const database = new URL(databaseUrl);
  if (
    database.protocol !== 'postgresql:' ||
    database.hostname !== '127.0.0.1' ||
    !/^\/hash_talk_[a-z0-9_]+$/u.test(database.pathname) ||
    database.search !== '' ||
    database.hash !== ''
  )
    throw new Error('Database must be dedicated and local.');
  return database;
}

function validateStagingDatabase(database: URL): void {
  if (
    database.port !== '45433' ||
    database.pathname !== '/hash_talk_stage' ||
    database.username !== 'hash_talk_stage' ||
    !database.password
  )
    throw new Error(
      'Staging database must use its dedicated cluster and role.',
    );
}

function webEndpoint(
  environment: Readonly<Record<string, string | undefined>>,
  staging: boolean,
): Pick<WebConfiguration, 'port' | 'origin' | 'socketPath'> {
  const portText =
    environment['HASH_TALK_PORT'] ?? (staging ? '45113' : '45100');
  if (!/^[1-9]\d{3,4}$/u.test(portText)) throw new Error('Invalid port.');
  const port = Number(portText);
  if (port > 65535) throw new Error('Invalid port.');
  if (!staging) return { port, origin: `http://127.0.0.1:${port}` };
  if (
    environment['HASH_TALK_PUBLIC_ORIGIN'] !== 'https://0xdmme.app' ||
    port !== 45113
  )
    throw new Error(
      'Staging requires the canonical HTTPS origin and a dedicated port.',
    );
  return {
    port,
    origin: 'https://0xdmme.app',
    socketPath: '/run/0xdmme-web/web.sock',
  };
}

function objectDirectory(
  environment: Readonly<Record<string, string | undefined>>,
  staging: boolean,
): string {
  const root = staging ? '/var/lib/0xdmme/data/objects' : resolve('.local');
  const directory = resolve(
    environment['HASH_TALK_OBJECT_DIRECTORY'] ??
      (staging ? `${root}/content` : '.local/objects'),
  );
  if (!directory.startsWith(`${root}${sep}`))
    throw new Error(
      "Objects must stay in the environment's private directory.",
    );
  return directory;
}

export function readWebConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): WebConfiguration {
  const staging = environment['HASH_TALK_PROFILE'] === 'staging';
  if (!staging) readPreparationProfile(environment);
  const databaseUrl = environment['HASH_TALK_DATABASE_URL'];
  if (!databaseUrl) throw new Error('Local database is not configured.');
  const database = validateDatabase(databaseUrl);
  if (staging) validateStagingDatabase(database);
  return {
    profile: staging ? 'staging' : 'development',
    ...webEndpoint(environment, staging),
    databaseUrl,
    objectDirectory: objectDirectory(environment, staging),
    ...accountConfiguration(environment, staging),
    ...gifConfiguration(environment),
  };
}
function gifConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): Pick<WebConfiguration, 'gifSearchKey'> {
  const key = environment['HASH_TALK_KLIPY_API_KEY'];
  if (key === undefined || key === '') return {};
  if (!/^[A-Za-z0-9]{32,128}$/u.test(key))
    throw new Error('Invalid KLIPY key.');
  return { gifSearchKey: key };
}
function accountConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
  staging: boolean,
): Pick<WebConfiguration, 'contentCapacity' | 'walletConnectProjectId'> {
  const capacityText = staging
    ? '3000000000'
    : (environment['HASH_TALK_ACCOUNT_CAPACITY_BYTES'] ?? '3000000000');
  if (!/^[1-9]\d{8,14}$/u.test(capacityText))
    throw new Error('Invalid account budget.');
  const accountCapacityBytes = Number(capacityText);
  if (
    !Number.isSafeInteger(accountCapacityBytes) ||
    accountCapacityBytes < 300_000_000
  )
    throw new Error('Invalid account budget.');
  const walletConnectProjectId =
    environment['HASH_TALK_WALLETCONNECT_PROJECT_ID'];
  if (
    walletConnectProjectId !== undefined &&
    !/^[a-f0-9]{32}$/u.test(walletConnectProjectId)
  )
    throw new Error('Invalid WalletConnect project ID.');
  return {
    contentCapacity: staging
      ? { mode: 'volume', directory: '/opt/0xdmme/release' }
      : { mode: 'fixed', bytes: accountCapacityBytes },
    ...(walletConnectProjectId ? { walletConnectProjectId } : {}),
  };
}
