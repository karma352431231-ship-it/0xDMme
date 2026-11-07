import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
  entries?: string[];
}> = [
  {
    name: 'native action output cannot import product internals',
    files: {
      'tests/fixtures/native-product-output.ts':
        "export { value } from '../../src/client/profile/index.ts';\n",
      'src/client/profile/index.ts': 'export const value = 1;\n',
    },
    entries: ['tests/fixtures/native-product-output.ts'],
    diagnostic: /native-direct-driver-observes-public-ui-only/,
  },
  {
    name: 'native action output cannot import Node services',
    files: {
      'tests/fixtures/native-product-output.ts':
        "export { readFile } from 'node:fs/promises';\n",
    },
    entries: ['tests/fixtures/native-product-output.ts'],
    diagnostic: /client-cannot-import-node/,
  },
  {
    name: 'native browser fixtures cannot import physical server admission',
    files: {
      'tests/fixtures/native-ios-direct-driver.ts':
        "export { value } from './native-physical-admission.ts';\n",
      'tests/fixtures/native-physical-admission.ts':
        'export const value = 1;\n',
    },
    entries: ['tests/fixtures/native-ios-direct-driver.ts'],
    diagnostic: /native-browser-fixtures-cannot-import-server-admission/,
  },
  {
    name: 'direct native UI fixtures cannot import production internals',
    files: {
      'tests/fixtures/native-ios-direct-driver.ts':
        "export { value } from '../../src/client/profile/index.ts';\n",
      'src/client/profile/index.ts': 'export const value = 1;\n',
    },
    entries: ['tests/fixtures/native-ios-direct-driver.ts'],
    diagnostic: /native-direct-driver-observes-public-ui-only/,
  },
  {
    name: 'direct native browser fixtures cannot import Node APIs',
    files: {
      'tests/fixtures/native-ios-direct-driver.ts':
        "export { readFile } from 'node:fs';\n",
    },
    entries: ['tests/fixtures/native-ios-direct-driver.ts'],
    diagnostic: /client-cannot-import-node/,
  },
  {
    name: 'domain modules cannot initialize the installed runtime',
    files: {
      'src/client/contacts/index.ts':
        "export { startInstalledEntry } from '../installed-runtime/index.ts';\n",
      'src/client/installed-runtime/index.ts':
        'export function startInstalledEntry() {}\n',
    },
    diagnostic: /installed-runtime-only-at-entry-points/,
  },
  {
    name: 'domain modules use the API transport instead of the native session implementation',
    files: {
      'src/client/contacts/index.ts':
        "export { NativeApiTransport } from '../native-api/index.ts';\n",
      'src/client/native-api/index.ts': 'export class NativeApiTransport {}\n',
    },
    diagnostic: /native-api-through-transport-only/,
  },
  {
    name: 'domain modules cannot import the native SDK',
    files: {
      'src/client/contacts/index.ts':
        "export { Capacitor } from '@capacitor/core';\n",
    },
    diagnostic: /native-sdk-only-in-native-entry/,
  },
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
        ...(scenario.entries ?? ['src']),
        '--config',
        '.dependency-cruiser.cjs',
      ]),
      scenario.diagnostic,
    );
  });
}

await test('public module interfaces remain allowed', (t) => {
  const directory = fixture(t, {
    'tests/fixtures/native-ios-direct-driver.ts':
      "export { value } from './native-product-dom.ts';\n",
    'tests/fixtures/native-product-dom.ts': 'export const value = 1;\n',
    'src/server/messages/index.ts':
      "export { value } from '../vault/index.ts';\n",
    'src/server/vault/index.ts': "export { value } from './internal.ts';\n",
    'src/server/vault/internal.ts': 'export const value = 1;\n',
    'src/client/wallet-proof/index.ts':
      "export { Signature } from 'ethers/crypto';\nexport { verifyMessage } from 'ethers/hash';\nexport { getBytes } from 'ethers/utils';\n",
    'src/client/mobile-feasibility/index.ts':
      "export { Capacitor } from '@capacitor/core';\n",
    'src/client/mobile-entry/index.ts':
      "export { startInstalledEntry } from '../installed-runtime/index.ts';\n",
    'src/client/recovery-return/mobile-entry.ts':
      "export { startInstalledEntry } from '../installed-runtime/index.ts';\n",
    'src/client/installed-runtime/index.ts':
      "export { NativeApiTransport } from '../native-api/index.ts';\nexport function startInstalledEntry() {}\n",
    'src/client/native-api/index.ts': 'export class NativeApiTransport {}\n',
  });
  const result = runGate(
    directory,
    'dependency-cruiser/bin/dependency-cruiser.mjs',
    [
      'src',
      'tests/fixtures/native-ios-direct-driver.ts',
      '--config',
      '.dependency-cruiser.cjs',
    ],
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

await test('ESLint blocks a function with five parameters', (t) => {
  const directory = fixture(t, {
    'src/server/main.ts':
      'export function sum(a: number, b: number, c: number, d: number, e: number) { return a + b + c + d + e; }\n',
  });
  expectFailure(
    runGate(directory, 'eslint/bin/eslint.js', ['.', '--max-warnings=0']),
    /max-params/,
  );
});

await test('type-aware lint blocks an unhandled promise', (t) => {
  const directory = fixture(t, {
    'src/server/main.ts': 'Promise.resolve(1);\n',
  });
  expectFailure(
    runGate(directory, 'eslint/bin/eslint.js', ['.', '--max-warnings=0']),
    /no-floating-promises/,
  );
});

await test('strict TypeScript blocks incompatible types', (t) => {
  const directory = fixture(t, {
    'src/server/main.ts': 'export const invalid: number = "text";\n',
  });
  const result = runGate(directory, 'typescript/bin/tsc', ['--noEmit']);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stdout, /TS2322/);
});

await test('lint requires relative extensions for native Node execution', (t) => {
  const directory = fixture(t, {
    'src/server/main.ts': "export { value } from './value';\n",
    'src/server/value.ts': 'export const value = 1;\n',
  });
  expectFailure(
    runGate(directory, 'eslint/bin/eslint.js', ['.', '--max-warnings=0']),
    /no-restricted-imports/,
  );
});

await test('incorrect formatting fails the check', (t) => {
  const directory = fixture(t, {
    'src/server/main.ts': 'export const value={a:1}\n',
  });
  expectFailure(
    runGate(directory, 'prettier/bin/prettier.cjs', ['--check', 'src']),
    /Code style issues/,
  );
});

const licenseCases = [
  {
    name: 'permissive dependency',
    license: 'MIT',
    version: '1.0.0',
    status: 0,
  },
  {
    name: 'unreviewed GPL dependency',
    license: 'GPL-3.0',
    version: '0.7.5',
    status: 1,
  },
  { name: 'missing license', version: '1.0.0', status: 1 },
  {
    name: 'reviewed native tooling license',
    package: 'big-integer',
    license: 'Unlicense',
    version: '1.6.52',
    status: 0,
  },
  {
    name: 'unreviewed native tooling update',
    package: 'big-integer',
    license: 'Unlicense',
    version: '1.6.53',
    status: 1,
  },
  {
    name: 'reviewed server push',
    license: 'MPL-2.0',
    version: '3.6.7',
    status: 0,
  },
  {
    name: 'unreviewed server push update',
    license: 'MPL-2.0',
    version: '3.6.8',
    status: 1,
  },
];

for (const scenario of licenseCases) {
  await test(`license gate: ${scenario.name}`, (t) => {
    const name =
      scenario.package ??
      (scenario.license === 'MPL-2.0' ? 'web-push' : 'snarkjs');
    const directory = fixture(t, {
      'src/tools/check-licenses.ts': readFileSync(
        join(repository, 'src/tools/check-licenses.ts'),
        'utf8',
      ),
      'package-lock.json': JSON.stringify({
        packages: {
          '': {},
          [`node_modules/${name}`]: {
            version: scenario.version,
            license: scenario.license,
          },
        },
      }),
    });
    const result = spawnSync(
      process.execPath,
      ['src/tools/check-licenses.ts'],
      {
        cwd: directory,
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 65_536,
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, scenario.status, result.stdout + result.stderr);
    if (scenario.status === 1)
      assert.match(
        result.stderr,
        new RegExp(`${name}@${scenario.version.replaceAll('.', '\\.')}`, 'u'),
      );
  });
}
