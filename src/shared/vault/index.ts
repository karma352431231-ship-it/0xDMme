import {
  AccountError,
  base64,
  boundedText,
  keys,
  object,
  uuid,
} from '../account/index.ts';
import {
  canonical,
  digest,
  eventHash,
  fingerprint,
  verify,
} from '../devices/index.ts';
import type { DirectoryEvent } from '../devices/index.ts';

export const vaultQuota = 300_000_000;
export const blockLimit = 3_000_000 + 28;
export const operationOverhead = 4096;
export const pageSize = 16;
export interface VaultCommit {
  version: 1;
  id: string;
  accountId: string;
  deviceId: string;
  directory: string;
  authorityRevision: number;
  epoch: number;
  sequence: number;
  previous: string | null;
  block: { hash: string; bytes: number };
  manifest: { iv: string; ciphertext: string };
  signature: string;
}
export interface VaultChange {
  version: 1;
  entity: string;
  kind: 'contact' | 'settings' | 'test' | 'address-book' | 'contact-invite';
  parents: string[];
  label: string;
}
export function integer(value: unknown, maximum = 100_000): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  )
    throw new AccountError(400, 'Número do cofre inválido.');
  return value;
}
export function vaultCommit(value: unknown): VaultCommit {
  const data = object(value);
  keys(data, [
    'version',
    'id',
    'accountId',
    'deviceId',
    'directory',
    'authorityRevision',
    'epoch',
    'sequence',
    'previous',
    'block',
    'manifest',
    'signature',
  ]);
  const block = object(data['block']);
  keys(block, ['hash', 'bytes']);
  const manifest = object(data['manifest']);
  keys(manifest, ['iv', 'ciphertext']);
  const sequence = integer(data['sequence']);
  const epoch = integer(data['epoch'], 128);
  const authorityRevision = integer(data['authorityRevision'], 128);
  const bytes = integer(block['bytes'], blockLimit);
  if (
    data['version'] !== 1 ||
    !sequence ||
    !epoch ||
    !authorityRevision ||
    bytes < 29
  )
    throw new AccountError(400, 'Formato do cofre inválido.');
  if (
    base64(manifest['iv'], 12).length !== 12 ||
    base64(manifest['ciphertext'], 4096).length < 16 ||
    base64(data['signature'], 64).length !== 64
  )
    throw new AccountError(400, 'Envelope do cofre inválido.');
  return {
    version: 1,
    id: uuid(data['id']),
    accountId: uuid(data['accountId']),
    deviceId: uuid(data['deviceId']),
    directory: fingerprint(data['directory']),
    authorityRevision,
    epoch,
    sequence,
    previous: data['previous'] === null ? null : fingerprint(data['previous']),
    block: { hash: fingerprint(block['hash']), bytes },
    manifest: {
      iv: boundedText(manifest['iv'], 16),
      ciphertext: boundedText(manifest['ciphertext'], 5464),
    },
    signature: boundedText(data['signature'], 88),
  };
}
export function vaultChange(value: unknown): VaultChange {
  const data = object(value);
  keys(data, ['version', 'entity', 'kind', 'parents', 'label']);
  const kind = data['kind'];
  if (
    data['version'] !== 1 ||
    !['contact', 'settings', 'test', 'address-book', 'contact-invite'].includes(
      String(kind),
    ) ||
    !Array.isArray(data['parents']) ||
    data['parents'].length > 16
  )
    throw new AccountError(400, 'Alteração privada inválida.');
  const parents = (data['parents'] as unknown[]).map(uuid);
  if (new Set(parents).size !== parents.length)
    throw new AccountError(400, 'Versões repetidas.');
  return {
    version: 1,
    entity: uuid(data['entity']),
    kind: kind as VaultChange['kind'],
    parents,
    label: boundedText(data['label'], 80),
  };
}
export function commitProof(commit: VaultCommit): string {
  const { signature: _signature, ...unsigned } = commit;
  void _signature;
  return canonical(['0xdmme-vault-commit', unsigned]);
}
export function commitHash(commit: VaultCommit): Promise<string> {
  return digest(canonical(commit));
}
export function operationBytes(commit: VaultCommit): number {
  return (
    commit.block.bytes +
    base64(commit.manifest.ciphertext, 4096).length +
    12 +
    operationOverhead
  );
}
export async function bytesHash(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export function vaultContext(
  commit: Pick<VaultCommit, 'accountId' | 'id' | 'epoch'>,
  purpose: 'manifest' | 'block',
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    canonical([
      '0xdmme-vault',
      1,
      purpose,
      commit.accountId,
      commit.id,
      commit.epoch,
    ]),
  );
}
export async function verifyCommit(
  input: unknown,
  authority: DirectoryEvent,
): Promise<VaultCommit> {
  const commit = vaultCommit(input);
  const device = authority.devices.find((d) => d.id === commit.deviceId);
  if (
    !device ||
    commit.accountId !== authority.accountId ||
    commit.epoch !== authority.epoch ||
    commit.authorityRevision !== authority.revision ||
    commit.directory !== (await eventHash(authority))
  )
    throw new AccountError(403, 'Manifesto sem autorização verificada.');
  await verify(device.signing, commit.signature, commitProof(commit));
  return commit;
}
export async function verifySuccessor(
  previous: VaultCommit | null,
  commit: VaultCommit,
): Promise<void> {
  if (
    commit.sequence !== (previous?.sequence ?? 0) + 1 ||
    commit.previous !== (previous ? await commitHash(previous) : null)
  )
    throw new AccountError(409, 'Cofre antigo, omitido ou divergente.');
  if (
    previous &&
    (commit.accountId !== previous.accountId ||
      commit.authorityRevision < previous.authorityRevision ||
      commit.epoch < previous.epoch)
  )
    throw new AccountError(409, 'Autoridade antiga no cofre.');
}
