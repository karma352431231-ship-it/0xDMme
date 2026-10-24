import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, platform, release } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { createTestDatabase } from './database.ts';
import {
  command,
  startProcess,
  stopProcess,
  signalProcess,
} from './process.ts';

async function freePort(): Promise<number> {
  for (let port = 45111; port <= 45119; port++) {
    const server = createServer();
    const free = await new Promise<boolean>((done) => {
      server.once('error', () => done(false));
      server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
    });
    if (free) return port;
  }
  throw new Error(
    'No unused fixture port in 45111–45119. No server will be reused.',
  );
}
async function ready(
  origin: string,
  owner: string,
  child: ReturnType<typeof startProcess>,
  signal: AbortSignal,
): Promise<void> {
  const deadline = performance.now() + 60_000;
  while (performance.now() < deadline) {
    signal.throwIfAborted();
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error('Fixture exited before readiness. Inspect fixture.log.');
    if (await fixtureReady(origin, owner)) return;
    await delay(100);
  }
  throw new Error('Fixture readiness deadline exceeded.');
}
/** A healthy listener alone cannot identify the process owned by this run. */
export async function fixtureReady(
  origin: string,
  owner: string,
): Promise<boolean> {
  try {
    const health = await fetch(`${origin}/health/ready`, {
      signal: AbortSignal.timeout(1000),
    });
    await health.arrayBuffer();
    if (!health.ok) return false;
    const proof = await fetch(`${origin}/fixture-owner-${owner}.txt`, {
      signal: AbortSignal.timeout(1000),
    });
    return proof.ok && (await proof.text()) === owner;
  } catch {
    // Refusal/unknown ownership is expected during startup and never permits reuse.
    return false;
  }
}
export async function startEnvironment(signal: AbortSignal) {
  const root = resolve('.local/chat-e2e');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(root, 'run-'));
  await writeFile(
    join(directory, 'owner.json'),
    JSON.stringify({ harness: '0xdmme-chat-e2e-v1' }),
    { mode: 0o600 },
  );
  const temporary = join(directory, 'temporary');
  await mkdir(temporary, { mode: 0o700 });
  let database: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
  let child: ReturnType<typeof startProcess> | undefined;
  let log = '';
  async function close(): Promise<void> {
    try {
      if (child) {
        await stopProcess(child);
        if (child.exitCode !== 0)
          throw new Error(
            'Fixture did not shut down cleanly; owned data cleanup still runs.',
          );
      }
    } finally {
      try {
        await database?.close();
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
  }
  try {
    signal.throwIfAborted();
    database = await createTestDatabase(
      process.env['HASH_TALK_E2E_DATABASE_URL'],
    );
    await command(['src/tools/build-web.ts'], process.env, signal);
    signal.throwIfAborted();
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const owner = randomBytes(24).toString('hex');
    child = startProcess(['tests/browser-fixture.ts'], {
      ...process.env,
      HASH_TALK_PROFILE: 'development',
      HASH_TALK_DATABASE_URL: database.url,
      HASH_TALK_OBJECT_DIRECTORY: join(temporary, 'objects'),
      HASH_TALK_FIXTURE_PORT: String(port),
      HASH_TALK_FIXTURE_HOST: '127.0.0.1',
      HASH_TALK_FIXTURE_CONTEXT_WALLETS: '1',
      HASH_TALK_FIXTURE_OWNER: owner,
      HASH_TALK_FIXTURE_PAIR_PORT: '',
      HASH_TALK_FIXTURE_VAULT_CONTROLS: '',
      HASH_TALK_FIXTURE_RECOVERY_CONTROLS: '',
      HASH_TALK_FIXTURE_QR_CAMERA: '',
      HASH_TALK_FIXTURE_EMOJI_CONTROLS: '',
    });
    const capture = (chunk: Buffer) => {
      log = (log + chunk.toString()).slice(-256_000);
    };
    child.stdout?.on('data', capture);
    child.stderr?.on('data', capture);
    const fixture = child;
    const abort = () => {
      signalProcess(fixture, 'SIGTERM');
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      await ready(origin, owner, child, signal);
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener('abort', abort);
    }
    const html = await readFile('dist/web/index.html', 'utf8');
    const bundle = html.match(/src="\/(app-[a-f0-9]+\.js)"/u)?.[1];
    if (!bundle) throw new Error('Built bundle identity missing.');
    await writeFile(
      join(directory, 'environment.json'),
      JSON.stringify(
        {
          commit: execFileSync('git', ['rev-parse', 'HEAD'], {
            encoding: 'utf8',
          }).trim(),
          dirty: Boolean(
            execFileSync('git', ['status', '--porcelain'], {
              encoding: 'utf8',
            }).trim(),
          ),
          bundle,
          fixtureOwnershipVerified: true,
          bundleSha256: createHash('sha256')
            .update(await readFile(`dist/web/${bundle}`))
            .digest('hex'),
          node: process.version,
          nodeOptions: process.env['NODE_OPTIONS'] ?? null,
          platform: platform(),
          os: release(),
          cpu: cpus()[0]?.model,
          runner: process.env['CI'] ? 'hosted-ci' : 'local',
          network: 'loopback; no shaping',
          cache: 'new browser contexts per scenario; warm within each scenario',
          time: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    return {
      origin,
      directory,
      close: async () => {
        try {
          await close();
        } finally {
          await writeFile(join(directory, 'fixture.log'), log);
        }
      },
    };
  } catch (error) {
    try {
      await close();
    } finally {
      await writeFile(join(directory, 'fixture.log'), log);
    }
    throw error;
  }
}
