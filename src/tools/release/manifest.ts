/** Public format: never copy deployment configuration into this document. */
export const repository = 'karma352431231-ship-it/0xDMme';
export const maximumManifest = 1024 * 1024;
export const maximumBytes = 96 * 1024 * 1024;
export const maximumFile = 40 * 1024 * 1024;
export interface ReleaseFile {
  path: string;
  bytes: number;
  sha256: string;
}
export interface ReleaseManifest {
  schema: 1;
  repository: typeof repository;
  commit: string;
  toolchain: { node: string; npm: string };
  sources: ReleaseFile[];
  assetIndex: ReleaseFile;
  assets: ReleaseFile[];
}

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid release record.');
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...keys].sort()))
    throw new Error('Unexpected release fields.');
  return value as Record<string, unknown>;
}

export function sourcePath(value: string): boolean {
  if (['package.json', 'package-lock.json', '.nvmrc'].includes(value))
    return true;
  return /^(?:src|infra)\/[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/u.test(
    value,
  );
}

export function assetPath(value: string): boolean {
  const name = value.endsWith('.br') ? value.slice(0, -3) : value;
  if (
    [
      '/wallet-metamask.svg',
      '/wallet-phantom.svg',
      '/wallet-backpack.png',
    ].includes(name)
  )
    return true;
  if (
    /^\/(?:index|wallet|recovery|phantom-probe|matrix-crypto-18\.9\.0-sources)\.html$/u.test(
      name,
    )
  )
    return true;
  if (
    /^\/(?:sw\.js|manifest\.webmanifest|icon\.svg|logo\.svg|icon-(?:192|512)\.png|notification-badge\.png|(?:figtree|sora)-latin-5\.3\.0\.woff2|matrix-crypto-18\.9\.0\.wasm)$/u.test(
      name,
    )
  )
    return true;
  return /^\/(?:(?:app|i18n-catalog|emoji-catalog|language-start|source-document|phantom-probe|recovery-return|attachment-worker|voice-worklet)-[a-f0-9]{16}\.(?:js|css)|emoji-[a-f0-9]{16}\.json\.gz|source-[a-f0-9]{16}\.tar\.gz|matrix-crypto-18\.9\.0-source-[a-f0-9]{16}-\d{2}\.bin|libsodium-0\.8\.4-sources-[a-f0-9]{16}\.tar\.xz)$/u.test(
    name,
  );
}

function file(
  value: unknown,
  permitted: (path: string) => boolean,
): ReleaseFile {
  const data = record(value, ['path', 'bytes', 'sha256']);
  if (typeof data['path'] !== 'string' || !permitted(data['path']))
    throw new Error('Invalid public release path.');
  if (
    typeof data['sha256'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(data['sha256'])
  )
    throw new Error('Invalid release digest.');
  if (
    typeof data['bytes'] !== 'number' ||
    !Number.isSafeInteger(data['bytes']) ||
    data['bytes'] < 0 ||
    data['bytes'] > maximumFile
  )
    throw new Error('Invalid release size.');
  return { path: data['path'], bytes: data['bytes'], sha256: data['sha256'] };
}

function files(
  value: unknown,
  permitted: (path: string) => boolean,
  maximum: number,
): ReleaseFile[] {
  if (!Array.isArray(value) || !value.length || value.length > maximum)
    throw new Error('Invalid release file count.');
  const result = (value as unknown[]).map((entry) => file(entry, permitted));
  const paths = result.map((entry) => entry.path);
  if (
    new Set(paths).size !== paths.length ||
    JSON.stringify(paths) !== JSON.stringify([...paths].sort())
  )
    throw new Error('Release paths must be unique and sorted.');
  if (result.reduce((sum, entry) => sum + entry.bytes, 0) > maximumBytes)
    throw new Error('Release exceeds its byte budget.');
  return result;
}

function releaseIdentity(data: Record<string, unknown>): {
  commit: string;
  toolchain: { node: string; npm: string };
} {
  if (data['schema'] !== 1 || data['repository'] !== repository)
    throw new Error('Unexpected release identity.');
  if (
    typeof data['commit'] !== 'string' ||
    !/^[a-f0-9]{40}$/u.test(data['commit'])
  )
    throw new Error('A full source commit is required.');
  const tools = record(data['toolchain'], ['node', 'npm']);
  if (tools['node'] !== '24.14.0' || tools['npm'] !== '11.9.0')
    throw new Error('Unreviewed release toolchain.');
  return {
    commit: data['commit'],
    toolchain: { node: tools['node'], npm: tools['npm'] },
  };
}

export function parseManifest(text: string): ReleaseManifest {
  if (Buffer.byteLength(text) > maximumManifest)
    throw new Error('Release manifest too large.');
  const data = record(JSON.parse(text) as unknown, [
    'schema',
    'repository',
    'commit',
    'toolchain',
    'sources',
    'assetIndex',
    'assets',
  ]);
  const identity = releaseIdentity(data);
  const sources = files(data['sources'], sourcePath, 2048);
  const assetIndex = file(
    data['assetIndex'],
    (path) => path === 'dist/web/assets.json',
  );
  const assets = files(data['assets'], assetPath, 128);
  for (const required of ['package.json', 'package-lock.json', '.nvmrc']) {
    if (!sources.some((entry) => entry.path === required))
      throw new Error('Incomplete release source contract.');
  }
  for (const required of ['/index.html', '/sw.js']) {
    if (!assets.some((entry) => entry.path === required))
      throw new Error('Incomplete public app shell.');
  }
  return {
    schema: 1,
    repository,
    commit: identity.commit,
    toolchain: identity.toolchain,
    sources,
    assetIndex,
    assets,
  };
}

export function encodeManifest(manifest: ReleaseManifest): string {
  return (
    JSON.stringify(parseManifest(JSON.stringify(manifest)), null, 2) + '\n'
  );
}
