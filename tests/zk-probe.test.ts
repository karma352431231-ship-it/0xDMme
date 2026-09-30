import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { parseObject } from '../src/shared/crypto-probe/index.ts';

await test('Semaphore gera prova real; alteração, membro removido, contexto e replay concorrente falham', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['src/tools/zk-probe.ts'],
    {
      cwd: new URL('../', import.meta.url),
      timeout: 45_000,
      maxBuffer: 65_536,
    },
  );
  const result = parseObject(stdout);
  for (const field of [
    'valid',
    'tamperRejected',
    'removedMemberRejected',
    'wrongContextRejected',
    'concurrentReplayRejected',
  ])
    assert.equal(result[field], true);
  assert.equal(typeof result.proveMs, 'number');
});
