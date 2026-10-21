import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { repository } from './manifest.ts';

export function attestationArguments(path: string, commit: string): string[] {
  if (!/^[a-f0-9]{40}$/u.test(commit))
    throw new Error('A full expected commit is required.');
  return [
    'attestation',
    'verify',
    resolve(path),
    '--hostname',
    'github.com',
    '--repo',
    repository,
    '--signer-workflow',
    repository + '/.github/workflows/release-proof.yml',
    '--source-ref',
    'refs/heads/main',
    '--source-digest',
    commit,
    '--cert-identity',
    'https://github.com/' +
      repository +
      '/.github/workflows/release-proof.yml@refs/heads/main',
    '--deny-self-hosted-runners',
  ];
}

export async function authenticate(
  path: string,
  commit: string,
): Promise<void> {
  try {
    await promisify(execFile)('gh', attestationArguments(path, commit), {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    throw new Error(
      'Release authentication failed. A supported GitHub CLI and valid main-workflow attestation are required.',
    );
  }
}
