import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createConnection, createServer } from 'node:net';
import {
  mkdtemp,
  realpath,
  rm,
  mkdir,
  writeFile,
  readFile,
  symlink,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readWebConfiguration } from '../src/server/web-configuration/index.ts';
import {
  MediaWorkerServer,
  mediaWorkerRequest,
  verifyWorkerPaths,
} from '../src/server/media-worker/index.ts';
import {
  CommunityMediaFiles,
  isolatedMediaProcess,
  mediaCommandPaths,
  preparationCommand,
  probeCommand,
} from '../src/server/community-media/index.ts';

await test('public worker accepts only canonical commands and files from the same reservation', async () => {
  const root = await realpath(
    await mkdtemp(resolve(tmpdir(), '0xdmme-worker-')),
  );
  try {
    const directory = resolve(root, crypto.randomUUID());
    await mkdir(directory);
    const source = resolve(directory, 'source');
    await writeFile(source, 'synthetic');
    const request = preparationCommand({
      kind: 'video',
      source,
      output: resolve(directory, 'result'),
    });
    assert.deepEqual(await verifyWorkerPaths(root, request), [
      source,
      resolve(directory, 'result'),
    ]);
    for (const kind of ['photo', 'gif', 'video', 'thumbnail'] as const) {
      const output =
        kind === 'photo'
          ? '-'
          : resolve(directory, kind === 'thumbnail' ? 'thumbnail' : 'result');
      const command = preparationCommand({ kind, source, output });
      mediaCommandPaths(command);
      if (kind === 'video') {
        assert.equal(command.maximumBytes, 100_000_000);
        const legacy = {
          ...command,
          maximumBytes: 25_000_000,
          args: command.args.map((arg, index) =>
            command.args[index - 1] === '-fs' ? '25000001' : arg,
          ),
        };
        mediaCommandPaths(legacy);
        assert.throws(() =>
          mediaCommandPaths({ ...legacy, args: [...legacy.args, '-y'] }),
        );
      }

      assert.throws(() =>
        mediaCommandPaths({ ...command, args: [...command.args, '-y'] }),
      );
      assert.throws(() =>
        mediaCommandPaths({
          ...command,
          maximumBytes: command.maximumBytes + 1,
        }),
      );
    }
    assert.throws(() =>
      mediaWorkerRequest({ operation: 'process', ...request, extra: true }),
    );
    await assert.rejects(
      verifyWorkerPaths(root, {
        ...request,
        args: request.args.map((a) => (a === source ? '/etc/passwd' : a)),
      }),
    );
    const other = resolve(root, crypto.randomUUID());
    await mkdir(other);
    await assert.rejects(
      verifyWorkerPaths(
        root,
        preparationCommand({
          kind: 'video',
          source,
          output: resolve(other, 'result'),
        }),
      ),
    );
    await symlink(source, resolve(directory, 'thumbnail'));
    await assert.rejects(
      verifyWorkerPaths(
        root,
        preparationCommand({
          kind: 'thumbnail',
          source,
          output: resolve(directory, 'thumbnail'),
        }),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await test('public socket: handshake, failures, shutdown and cancellation without a pending queue', async () => {
  const root = await realpath(
    await mkdtemp(resolve(tmpdir(), '0xdmme-worker-ipc-')),
  );
  const path = resolve(root, 'worker.sock');
  const worker = new MediaWorkerServer({
    root,
    runtime: {
      ffmpeg: '/usr/bin/false',
      ffprobe: '/usr/bin/false',
      limit: null,
    },
  });
  try {
    worker.server.listen(path);
    await once(worker.server, 'listening');
    assert.equal(
      await isolatedMediaProcess(path, null, AbortSignal.timeout(2000)),
      '0xdmme-media-worker-v1',
    );
    assert.deepEqual(
      await Promise.all(
        Array.from({ length: 16 }, () =>
          isolatedMediaProcess(path, null, AbortSignal.timeout(2000)),
        ),
      ),
      Array.from({ length: 16 }, () => '0xdmme-media-worker-v1'),
    );
    const directory = resolve(root, crypto.randomUUID());
    await mkdir(directory);
    const source = resolve(directory, 'source');
    await writeFile(source, 'synthetic');
    await assert.rejects(
      isolatedMediaProcess(
        path,
        {
          binary: 'ffprobe',
          args: probeCommand(source),
          maximumBytes: 100_000_000,
        },
        AbortSignal.timeout(2000),
      ),
    );
    const idle = createConnection(path);
    idle.on('error', () => undefined);
    await once(idle, 'connect');
    const closed = once(idle, 'close');
    await worker.close();
    await closed;
    await worker.close();
    await assert.rejects(
      isolatedMediaProcess(path, null, AbortSignal.timeout(2000)),
    );
  } finally {
    await worker.close();
    await rm(root, { recursive: true, force: true });
  }
});

await test('isolated transport never transmits AbortSignal and closes cancelled requests', async () => {
  const root = await realpath(
    await mkdtemp(resolve(tmpdir(), '0xdmme-worker-abort-')),
  );
  const path = resolve(root, 'worker.sock');
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    socket.setEncoding('utf8');
    let payload = '';
    socket.on('data', (chunk: string) => {
      payload += chunk;
    });
    socket.on('error', () => undefined);
    socket.on('end', () => {
      assert.deepEqual(Object.keys(JSON.parse(payload) as object).sort(), [
        'args',
        'binary',
        'maximumBytes',
        'operation',
      ]);
      socket.end(JSON.stringify({ ok: true, output: 'synthetic' }));
    });
  });
  try {
    server.listen(path);
    await once(server, 'listening');
    const controller = new AbortController();
    const request = {
      binary: 'ffprobe' as const,
      args: ['synthetic'],
      maximumBytes: 1,
      signal: controller.signal,
    };
    assert.equal(
      await isolatedMediaProcess(path, request, controller.signal),
      'synthetic',
    );
    controller.abort();
    await assert.rejects(isolatedMediaProcess(path, null, controller.signal));
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});

await test('shared processing exposes only the assembled original to the isolated group', async () => {
  const root = await realpath(
    await mkdtemp(resolve(tmpdir(), '0xdmme-worker-files-')),
  );
  const files = new CommunityMediaFiles(root, { sharedProcessing: true });
  const id = crypto.randomUUID(),
    bytes = Buffer.from('synthetic');
  try {
    await files.initialize();
    await files.part(id, 0, bytes);
    const source = await files.assemble({
      id,
      kind: 'photo',
      bytes: bytes.length,
      hash: createHash('sha256').update(bytes).digest('hex'),
    });
    assert.equal((await stat(source)).mode & 0o777, 0o640);
    assert.equal(
      (await stat(resolve(files.root, id, 'part-0'))).mode & 0o777,
      0o600,
    );
    assert.equal((await stat(resolve(files.root, id))).mode & 0o7777, 0o770);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

await test('installed worker uses the same media directory as staging web', async () => {
  const config = readWebConfiguration({
    HASH_TALK_PROFILE: 'staging',
    HASH_TALK_PUBLIC_ORIGIN: 'https://0xdmme.app',
    HASH_TALK_DATABASE_URL:
      'postgresql://hash_talk_stage:synthetic@127.0.0.1:45433/hash_talk_stage',
  });
  const unit = await readFile(
    new URL('../infra/staging/0xdmme-media.service', import.meta.url),
    'utf8',
  );
  const root = `${config.objectDirectory}/community-media`;
  assert.ok(
    unit.split('\n').includes(`Environment=HASH_TALK_MEDIA_ROOT=${root}`),
  );
  assert.ok(unit.split('\n').includes(`BindPaths=${root}`));
});
