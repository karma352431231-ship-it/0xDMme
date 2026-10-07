import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

/** Assemble the real restricted CLI against this suite's synthetic appealed photo. */
export async function checkOperatorPreview(input: {
  databaseUrl: string;
  objectDirectory: string;
  id: string;
  bytes: Uint8Array;
}): Promise<void> {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), '0xdmme-operator-cli-')),
  );
  await mkdir(join(root, '.local'), { mode: 0o700 });
  await writeFile(
    join(root, '.local/moderation-operator.json'),
    JSON.stringify({
      databaseUrl: input.databaseUrl,
      objectDirectory: input.objectDirectory,
    }),
    { mode: 0o600 },
  );
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL('../../src/tools/moderation-operator.ts', import.meta.url),
      ),
      'preview',
      input.id,
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const exited = new Promise<number | null>((accept) => {
    child.once('exit', accept);
    child.once('error', () => accept(null));
  });
  const deadline = setTimeout(() => child.kill('SIGKILL'), 10_000);
  try {
    const url = await new Promise<string>((accept, reject) => {
      let output = '';
      child.once('error', reject);
      child.once('exit', () =>
        reject(new Error('Prévia restrita encerrou antes de iniciar.')),
      );
      child.stdout.on('data', (bytes: Buffer) => {
        output += bytes.toString('utf8');
        if (output.length > 2048) {
          reject(new Error('Saída da prévia excedida.'));
          return;
        }
        const match = /http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{64}/u.exec(output);
        if (match) accept(match[0]);
      });
    });
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(
      response.headers
        .get('content-security-policy')
        ?.includes("default-src 'none'"),
    );
    const markup = await response.text();
    assert.ok(markup.includes('Revisão excepcional'));
    assert.equal(
      (
        await fetch(url, {
          headers: { Origin: 'https://invalid.example' },
          signal: AbortSignal.timeout(3000),
        })
      ).status,
      404,
    );
    const wrong = new URL('/invalido', url);
    assert.equal(
      (await fetch(wrong, { signal: AbortSignal.timeout(3000) })).status,
      404,
    );
    const photo = await fetch(`${url}/file`, {
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/png');
    assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), input.bytes);
  } finally {
    child.kill('SIGTERM');
    await exited;
    clearTimeout(deadline);
    await rm(root, { recursive: true, force: true });
  }
}
