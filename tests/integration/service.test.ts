import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

await test('processo web inicia com estado persistido e encerra por SIGTERM sem vazamento', async (t) => {
  const service = spawn(process.execPath, ['src/server/main.ts'], {
    env: { ...process.env, HASH_TALK_PORT: '45109' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => {
    if (service.exitCode === null) service.kill('SIGTERM');
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    service.once('error', reject);
    service.once('exit', resolve);
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Serviço não iniciou.')),
      8_000,
    );
    service.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('Serviço terminou antes da inicialização.'));
    });
    // The log only signals startup; HTTP readiness verifies the behavior below.
    // Branding and wording changes must not replace that functional assertion.
    service.stdout.once('data', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  const ready = await fetch('http://127.0.0.1:45109/health/ready', {
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(ready.status, 200);
  service.kill('SIGTERM');
  assert.equal(await exited, 0);
  await assert.rejects(
    fetch('http://127.0.0.1:45109/health/live', {
      signal: AbortSignal.timeout(3000),
    }),
  );
});
