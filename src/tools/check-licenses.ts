import { readFile } from 'node:fs/promises';

interface LockEntry {
  version?: string;
  license?: string;
}
interface Lockfile {
  packages: Record<string, LockEntry>;
}

const permissive = new Set([
  'MIT',
  'Apache-2.0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  '0BSD',
  '(MIT OR CC0-1.0)',
  '(MIT OR Apache-2.0)',
]);
// Reviewed exact versions. Any new copyleft dependency needs an explicit review.
const reviewedGpl = new Set([
  '@iden3/bigarray@0.0.2',
  '@iden3/binfileutils@0.0.12',
  'circom_tester@0.0.24',
  'fastfile@0.0.20',
  'ffjavascript@0.3.0',
  'ffjavascript@0.3.1',
  'r1csfile@0.0.48',
  'snarkjs@0.7.5',
  'wasmbuilder@0.0.16',
  'wasmcurves@0.2.2',
]);

const lock = JSON.parse(
  await readFile(new URL('../../package-lock.json', import.meta.url), 'utf8'),
) as Lockfile;
const counts = new Map<string, number>();
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path) continue;
  const name = path.split('node_modules/').at(-1);
  let license = entry.license;
  if (name === 'esprima' && entry.version === '1.2.5' && !license) {
    const text = await readFile(
      new URL('../../node_modules/esprima/LICENSE.BSD', import.meta.url),
      'utf8',
    );
    if (
      !text.includes('Redistribution and use in source and binary forms') ||
      !text.includes('THIS SOFTWARE IS PROVIDED')
    )
      throw new Error('Licença Esprima alterada.');
    // Legacy package declares a licenses array omitted from the npm lockfile.
    license = 'BSD-2-Clause';
  }
  const approved =
    license !== undefined &&
    (permissive.has(license) ||
      (license === 'MPL-2.0' &&
        name === 'web-push' &&
        entry.version === '3.6.7') ||
      (license === 'GPL-3.0' && reviewedGpl.has(`${name}@${entry.version}`)));
  if (!approved)
    throw new Error(
      `Dependência exige revisão de licença: ${name}@${entry.version}`,
    );
  counts.set(license ?? '', (counts.get(license ?? '') ?? 0) + 1);
}
process.stdout.write(
  `Licenças npm revisadas: ${JSON.stringify(Object.fromEntries(counts))}\n`,
);
