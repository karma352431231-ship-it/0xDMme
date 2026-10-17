import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PublicMediaService,
  createPublicMediaHandler,
} from '../src/server/public-media/index.ts';
import { CommunityMediaFiles } from '../src/server/community-media/index.ts';

async function fixture(t: TestContext) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), '0xdmme-public-range-')),
  );
  const files = new CommunityMediaFiles(root),
    id = crypto.randomUUID(),
    review = crypto.randomUUID();
  await files.initialize();
  const directory = await files.directory(id),
    bytes = Buffer.alloc(1_048_577);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
  const thumbnail = Buffer.from([3, 2, 1]);
  await writeFile(join(directory, 'result'), bytes);
  await writeFile(join(directory, 'thumbnail'), thumbnail);
  const candidate = {
    id,
    result: {
      kind: 'video' as const,
      type: 'video/mp4' as const,
      bytes: bytes.length,
      width: 64,
      height: 64,
      seconds: 1,
      fps: 30,
      thumbnailBytes: 3,
      normalized: true as const,
    },
    resultHash: createHash('sha256').update(bytes).digest('hex'),
    thumbnailHash: createHash('sha256').update(thumbnail).digest('hex'),
  };
  let visible = true,
    reads = 0,
    revokeOnRecheck = false;
  const handler = createPublicMediaHandler(
    new PublicMediaService(
      {
        profiles: { releasedAvatar: () => Promise.resolve(null) },
        communities: { releasedPhoto: () => Promise.resolve(null) },
        media: {
          releasedMedia: (target, released) => {
            reads++;
            return Promise.resolve(
              visible &&
                !(revokeOnRecheck && reads % 2 === 0) &&
                target === id &&
                released === review
                ? candidate
                : null,
            );
          },
        },
      },
      root,
    ),
  );
  const unexpected: unknown[] = [];
  const server = createServer((request, response) => {
    void handler.handle(request, response).catch((error) => {
      unexpected.push(error);
      response.destroy();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/public-media/post-media/${id}/${review}`;
  t.after(async () => {
    handler.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
    assert.deepEqual(unexpected, []);
  });
  return {
    url,
    bytes,
    directory,
    candidate,
    files,
    request: (options: RequestInit = {}) =>
      fetch(url, {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(3000),
      }),
    hide: () => {
      visible = false;
    },
    revoke: () => {
      reads = 0;
      revokeOnRecheck = true;
    },
  };
}

await test('released public video serves the exact requested bytes instead of the whole file', async (t) => {
  const f = await fixture(t),
    response = await f.request({ headers: { Range: 'bytes=0-1023' } });
  assert.equal(response.status, 206);
  assert.equal(
    response.headers.get('content-range'),
    `bytes 0-1023/${f.bytes.length}`,
  );
  assert.equal(response.headers.get('content-length'), '1024');
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    f.bytes.subarray(0, 1024),
  );
});

await test('public single ranges, HEAD, strong If-Range and unsatisfied requests keep exact lengths', async (t) => {
  const f = await fixture(t),
    length = f.bytes.length;
  for (const [header, start, end] of [
    ['bytes=32-', 32, length - 1],
    ['BYTES=0-7', 0, 7],
    ['bytes=0-999999999999999999999999', 0, length - 1],
    ['bytes=-999999999999999999999999', 0, length - 1],
    ['bytes=-17', length - 17, length - 1],
    [`bytes=${length - 16}-${length + 100}`, length - 16, length - 1],
    [`bytes=-${length + 1}`, 0, length - 1],
  ] as const) {
    const response = await f.request({ headers: { Range: header } });
    assert.equal(response.status, 206);
    assert.equal(
      response.headers.get('content-range'),
      `bytes ${start}-${end}/${length}`,
    );
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      f.bytes.subarray(start, end + 1),
    );
  }
  for (const header of [
    `bytes=${length}-`,
    'bytes=-0',
    'bytes=10-9',
    'bytes=-',
    'bytes=999999999999999999999999-',
  ]) {
    const response = await f.request({ headers: { Range: header } });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('content-range'), `bytes */${length}`);
    await response.arrayBuffer();
  }
  const head = await f.request({
    method: 'HEAD',
    headers: { Range: 'bytes=-0' },
  });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), String(length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const etag = head.headers.get('etag');
  assert.ok(etag);
  for (const validator of [etag, '"previous-version"']) {
    const response = await f.request({
      headers: { Range: 'bytes=0-7', 'If-Range': validator },
    });
    assert.equal(response.status, validator === etag ? 206 : 200);
    assert.equal(
      (await response.arrayBuffer()).byteLength,
      validator === etag ? 8 : length,
    );
  }
  for (const header of ['items=0-1', 'bytes=0-1,4-5']) {
    const response = await f.request({ headers: { Range: header } });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
});

await test('ranges verify integrity outside the requested bytes and recheck release before headers', async (t) => {
  const f = await fixture(t);
  const corrupted = Buffer.from(f.bytes);
  corrupted[corrupted.length - 1] = (corrupted[corrupted.length - 1] ?? 0) ^ 1;
  await writeFile(join(f.directory, 'result'), corrupted);
  const corrupt = await f.request({ headers: { Range: 'bytes=0-7' } });
  assert.equal(corrupt.status, 503);
  await corrupt.arrayBuffer();
  await writeFile(join(f.directory, 'result'), f.bytes);
  f.revoke();
  const revoked = await f.request({ headers: { Range: 'bytes=0-7' } });
  assert.equal(revoked.status, 404);
  assert.equal(revoked.headers.get('content-range'), null);
  await revoked.arrayBuffer();
  f.hide();
  const hidden = await f.request({ method: 'HEAD' });
  assert.equal(hidden.status, 404);
  assert.equal(hidden.headers.get('content-length'), null);
});

await test('HEAD and range readers keep buffers bounded and reject memory pressure before retry recovery', async (t) => {
  const f = await fixture(t),
    allocations: number[] = [],
    allocate = Buffer.alloc.bind(Buffer);
  t.mock.method(Buffer, 'alloc', (size: number) => {
    allocations.push(size);
    return allocate(size);
  });
  const head = await f.request({ method: 'HEAD' });
  assert.equal(head.status, 200);
  const partial = await f.request({ headers: { Range: 'bytes=0-7' } });
  assert.equal(partial.status, 206);
  await partial.arrayBuffer();
  assert.ok(allocations.length > 0);
  assert.ok(Math.max(...allocations) <= 65_536);
  let available = 0;
  t.mock.method(process, 'availableMemory', () => available);
  const refused = await f.request();
  assert.equal(refused.status, 503);
  await refused.arrayBuffer();
  available = 8_000_000;
  const recovered = await f.request({ headers: { Range: 'bytes=0-7' } });
  assert.equal(recovered.status, 206);
  await recovered.arrayBuffer();
});

await test('cancelled public streaming closes its pinned descriptor and leaves the next reader usable', async (t) => {
  const f = await fixture(t),
    openRead = f.files.openRead.bind(f.files);
  let closed = 0;
  t.mock.method(
    CommunityMediaFiles.prototype,
    'openRead',
    async function (
      id: string,
      name: 'result' | 'thumbnail',
      expected: number,
    ) {
      const file = await openRead(id, name, expected),
        close = file.close.bind(file);
      t.mock.method(file, 'close', async () => {
        closed++;
        await close();
      });
      return file;
    },
  );
  const response = await f.request(),
    reader = response.body!.getReader();
  assert.equal(response.status, 200);
  assert.equal((await reader.read()).done, false);
  await reader.cancel();
  for (let attempt = 0; attempt < 50 && !closed; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(closed, 1);
  const next = await f.request({ headers: { Range: 'bytes=0-7' } });
  assert.equal(next.status, 206);
  await next.arrayBuffer();
});
