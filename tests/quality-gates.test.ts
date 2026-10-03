import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';

const repository = resolve(import.meta.dirname, '..');

function fixture(
  t: TestContext,
  files: Readonly<Record<string, string>>,
): string {
  const directory = mkdtempSync(join(tmpdir(), 'hash-talk-gates-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const name of [
    'package.json',
    'tsconfig.json',
    'eslint.config.mjs',
    '.dependency-cruiser.cjs',
    '.prettierrc.json',
  ]) {
    copyFileSync(join(repository, name), join(directory, name));
  }
  symlinkSync(
    join(repository, 'node_modules'),
    join(directory, 'node_modules'),
    'dir',
  );
  for (const [name, content] of Object.entries(files)) {
    const path = join(directory, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return directory;
}

function runGate(directory: string, cli: string, args: string[]) {
  return spawnSync(
    process.execPath,
    [join(repository, 'node_modules', cli), ...args],
    {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    },
  );
}

function expectFailure(
  result: ReturnType<typeof runGate>,
  diagnostic: RegExp,
): void {
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, diagnostic);
}

const architectureCases: ReadonlyArray<{
  name: string;
  files: Readonly<Record<string, string>>;
  diagnostic: RegExp;
}> = [
  {
    name: 'cliente não importa servidor',
    files: {
      'src/client/main.ts':
        "import { value } from '../server/configuration/index.ts';\nexport { value };\n",
      'src/server/configuration/index.ts': 'export const value = 1;\n',
    },
    diagnostic: /client-cannot-import-server/,
  },
  {
    name: 'cliente não importa APIs do Node',
    files: {
      'src/client/main.ts':
        "import { readFile } from 'node:fs';\nexport { readFile };\n",
    },
    diagnostic: /client-cannot-import-node/,
  },
  {
    name: 'servidor não importa módulos do cliente',
    files: {
      'src/server/main.ts': "export { value } from '../client/main.ts';\n",
      'src/client/main.ts': 'export const value = 1;\n',
    },
    diagnostic: /server-cannot-import-client/,
  },
  {
    name: 'código compartilhado não importa servidor',
    files: {
      'src/shared/main.ts':
        "export { value } from '../server/configuration/index.ts';\n",
      'src/server/configuration/index.ts': 'export const value = 1;\n',
    },
    diagnostic: /shared-cannot-import-private-environments/,
  },
  {
    name: 'ciclos de dependência são bloqueados',
    files: {
      'src/server/a.ts': "export { value } from './b.ts';\n",
      'src/server/b.ts': "import './a.ts';\nexport const value = 1;\n",
    },
    diagnostic: /no-cycles/,
  },
  {
    name: 'módulos não importam arquivos internos de outro módulo',
    files: {
      'src/server/messages/index.ts':
        "export { value } from '../vault/internal.ts';\n",
      'src/server/vault/internal.ts': 'export const value = 1;\n',
    },
    diagnostic: /module-public-interfaces-only/,
  },
  {
    name: 'exports de pacote recusam acesso a caminho privado não publicado',
    files: {
      'src/client/main.ts':
        "export { Signature } from 'ethers/lib.esm/crypto/signature.js';\n",
    },
    diagnostic: /no-unresolved-imports/,
  },
];

for (const scenario of architectureCases) {
  await test(scenario.name, (t) => {
    const directory = fixture(t, scenario.files);
    expectFailure(
      runGate(directory, 'dependency-cruiser/bin/dependency-cruiser.mjs', [
        'src',
        '--config',
        '.dependency-cruiser.cjs',
      ]),
      scenario.diagnostic,
    );
  });
}

await test('interfaces públicas de módulos continuam permitidas', (t) => {
  const directory = fixture(t, {
    'src/server/messages/index.ts':
      "export { value } from '../vault/index.ts';\n",
    'src/server/vault/index.ts': "export { value } from './internal.ts';\n",
    'src/server/vault/internal.ts': 'export const value = 1;\n',
    'src/client/wallet-proof/index.ts':
      "export { Signature } from 'ethers/crypto';\nexport { verifyMessage } from 'ethers/hash';\nexport { getBytes } from 'ethers/utils';\n",
  });
  const result = runGate(
    directory,
    'dependency-cruiser/bin/dependency-cruiser.mjs',
    ['src', '--config', '.dependency-cruiser.cjs'],
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

await test('ESLint bloqueia função com cinco parâmetros', (t) => {
  const directory = fixture(t, {
    'src/server/main.ts':
      'export function sum(a: number, b: number, c: number, d: number, e: number) { return a + b + c + d + e; }\n',
  });
  expectFailure(
    runGate(directory, 'eslint/bin/eslint.js', ['.', '--max-warnings=0']),
    /max-params/,
  );
});

await test('lint com tipos bloqueia promise sem tratamento', (t) => {
  const directory = fixture(t, {
    'src/server/main.ts': 'Promise.resolve(1);\n',
  });
  expectFailure(
    runGate(directory, 'eslint/bin/eslint.js', ['.', '--max-warnings=0']),
    /no-floating-promises/,
  );
});

await test('TypeScript strict bloqueia tipos incompatíveis', (t) => {
  const directory = fixture(t, {
    'src/server/main.ts': 'export const invalid: number = "text";\n',
  });
  const result = runGate(directory, 'typescript/bin/tsc', ['--noEmit']);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stdout, /TS2322/);
});

await test('lint exige extensão relativa para execução nativa no Node', (t) => {
  const directory = fixture(t, {
    'src/server/main.ts': "export { value } from './value';\n",
    'src/server/value.ts': 'export const value = 1;\n',
  });
  expectFailure(
    runGate(directory, 'eslint/bin/eslint.js', ['.', '--max-warnings=0']),
    /no-restricted-imports/,
  );
});

await test('formatação incorreta faz a checagem falhar', (t) => {
  const directory = fixture(t, {
    'src/server/main.ts': 'export const value={a:1}\n',
  });
  expectFailure(
    runGate(directory, 'prettier/bin/prettier.cjs', ['--check', 'src']),
    /Code style issues/,
  );
});
