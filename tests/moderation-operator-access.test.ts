import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdir,
  mkdtemp,
  writeFile,
  chmod,
  rm,
  realpath,
  unlink,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOperatorConfiguration } from '../src/tools/moderation-operator-access.ts';

await test('operador: configuração só do proprietário, privada e sem links simbólicos', async () => {
  const root = await realpath(
      await mkdtemp(join(tmpdir(), '0xdmme-operator-access-')),
    ),
    directory = join(root, '.local'),
    path = join(directory, 'moderation-operator.json');
  const config = {
    databaseUrl: 'postgresql://localhost/hash_talk_test_operator',
    objectDirectory: root,
  };
  try {
    await mkdir(directory, { mode: 0o700 });
    await writeFile(path, JSON.stringify(config), { mode: 0o600 });
    assert.deepEqual(await readOperatorConfiguration(root), config);
    await chmod(path, 0o644);
    await assert.rejects(readOperatorConfiguration(root), /0600/);
    await chmod(path, 0o600);
    await chmod(directory, 0o755);
    await assert.rejects(readOperatorConfiguration(root), /0700/);
    await chmod(directory, 0o700);
    await writeFile(
      path,
      JSON.stringify({ ...config, objectDirectory: './objects' }),
    );
    await assert.rejects(readOperatorConfiguration(root), /objetos/);
    await unlink(path);
    const external = join(root, 'other.json');
    await writeFile(external, JSON.stringify(config), { mode: 0o600 });
    await symlink(external, path);
    await assert.rejects(readOperatorConfiguration(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
