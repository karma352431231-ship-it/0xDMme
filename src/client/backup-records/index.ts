import {
  base64,
  boundedText,
  encode,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { vaultChange } from '../../shared/vault/index.ts';
import type { VaultChange } from '../../shared/vault/index.ts';
import {
  attachmentContent,
  contentRefs,
  fileLimit,
} from '../../shared/attachments/index.ts';
import { profileCard } from '../message-profile/index.ts';
import { decodePrivateProfile } from '../account-profile/index.ts';
import { peer } from '../../shared/contacts/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import { optionalRelation, relationKeys } from '../../shared/daily/index.ts';
import type { MessageRelation } from '../../shared/daily/index.ts';
import { backupRecordLimit } from '../../shared/backups/index.ts';
import type { BackupTarget } from '../../shared/backups/index.ts';
export type BackupRecord =
  | { type: 'account'; id: string; hash: string; value: string }
  | {
      type: 'vault';
      id: string;
      hash: string;
      change: VaultChange;
      value: string;
    }
  | {
      type: 'message';
      sequence?: number;
      participant?: Peer;
      relation?: MessageRelation;
      id: string;
      hash: string;
      peer: string;
      own: boolean;
      kind: 'text' | 'profile' | 'attachment';
      text: string;
    }
  | {
      type: 'media';
      id: string;
      hash: string;
      message: string;
      thumbnail: boolean;
      bytes: string;
    };
function optionalSequence(data: Record<string, unknown>): {
  sequence?: number;
} {
  return Object.hasOwn(data, 'sequence')
    ? { sequence: integer(data['sequence'], Number.MAX_SAFE_INTEGER) }
    : {};
}
function participant(data: Record<string, unknown>): { participant?: Peer } {
  if (!Object.hasOwn(data, 'participant')) return {};
  const result = peer(data['participant']);
  if (result.accountId !== data['peer'])
    throw new Error('Participante histórico divergente.');
  return { participant: result };
}
export function backupRecord(input: unknown): BackupRecord {
  const d = object(input),
    type = d['type'];
  const id = uuid(d['id']),
    hash = fingerprint(d['hash']);
  if (type === 'account') {
    keys(d, ['type', 'id', 'hash', 'value']);
    const value = boundedText(d['value'], 4_300_000);
    decodePrivateProfile(value).photo?.bytes.fill(0);
    return { type, id, hash, value };
  }
  if (type === 'vault') {
    keys(d, ['type', 'id', 'hash', 'change', 'value']);
    const value = boundedText(d['value'], 3_000_000);
    if (new TextEncoder().encode(value).length > 3_000_000)
      throw new Error('Conteúdo do cofre excedido.');
    return { type, id, hash, change: vaultChange(d['change']), value };
  }
  if (type === 'message') return messageRecord(d, id, hash);
  if (type === 'media') {
    keys(d, ['type', 'id', 'hash', 'message', 'thumbnail', 'bytes']);
    if (typeof d['thumbnail'] !== 'boolean')
      throw new Error('Mídia histórica inválida.');
    const bytes = base64(d['bytes'], fileLimit);
    if (!bytes.length) throw new Error('Mídia vazia.');
    return {
      type,
      id,
      hash,
      message: uuid(d['message']),
      thumbnail: d['thumbnail'],
      bytes: encode(bytes),
    };
  }
  throw new Error('Tipo de registro de backup não suportado.');
}
function messageRecord(
  d: Record<string, unknown>,
  id: string,
  hash: string,
): BackupRecord {
  keys(d, [
    'type',
    'id',
    'hash',
    'peer',
    'own',
    'kind',
    'text',
    ...(Object.hasOwn(d, 'sequence') ? ['sequence'] : []),
    ...(Object.hasOwn(d, 'participant') ? ['participant'] : []),
    ...relationKeys(d),
  ]);
  const kind = d['kind'];
  if (
    typeof d['own'] !== 'boolean' ||
    !['text', 'profile', 'attachment'].includes(String(kind))
  )
    throw new Error('Mensagem histórica inválida.');
  const text = boundedText(d['text'], backupRecordLimit);
  validateContent(String(kind), text);
  return {
    type: 'message',
    id,
    hash,
    ...optionalSequence(d),
    ...participant(d),
    peer: uuid(d['peer']),
    own: d['own'],
    kind: kind as 'text' | 'profile' | 'attachment',
    ...optionalRelation(d['relation']),
    text,
  };
}

function validateContent(kind: string, text: string): void {
  if (kind === 'profile') profileCard(JSON.parse(text) as unknown);
  if (kind === 'attachment') attachmentContent(JSON.parse(text) as unknown);
  if (kind === 'text' && text.length > 4000)
    throw new Error('Texto histórico excedido.');
}
export function recordKey(row: Pick<BackupRecord, 'type' | 'id'>): string {
  return `${row.type}:${row.id}`;
}
export function cleanupTarget(
  row: BackupRecord,
  media: ReadonlySet<string>,
): BackupTarget | null {
  if (row.type === 'media' || row.type === 'account') return null;
  if (row.type === 'message' && row.kind === 'attachment') {
    const content = attachmentContent(JSON.parse(row.text) as unknown);
    if (
      contentRefs(content).some(
        (ref) => !media.has(`${row.id}:${ref.id}:${ref.hash}`),
      )
    )
      return null;
  }
  return {
    kind: row.type === 'vault' ? 'vault' : 'message',
    id: row.id,
    hash: row.hash,
  };
}

/** Base64 text avoids unbounded JSON escape expansion for valid 3 MB vault blocks. */
export function serializeRecord(row: BackupRecord): Uint8Array<ArrayBuffer> {
  const field =
    row.type === 'vault' || row.type === 'account'
      ? 'value'
      : row.type === 'message'
        ? 'text'
        : null;
  const encoder = new TextEncoder();
  if (!field) return encoder.encode(JSON.stringify(row));
  const bytes = encoder.encode(
    row.type === 'vault' || row.type === 'account'
      ? row.value
      : row.type === 'message'
        ? row.text
        : '',
  );
  try {
    return encoder.encode(
      JSON.stringify({
        ...row,
        [field]: encode(bytes),
        encoding: 'base64-utf8',
      }),
    );
  } finally {
    bytes.fill(0);
  }
}
export function deserializeRecord(bytes: Uint8Array): BackupRecord {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const raw = object(JSON.parse(decoder.decode(bytes)) as unknown);
  if (raw['type'] === 'media') return backupRecord(raw);
  if (raw['encoding'] !== 'base64-utf8')
    throw new Error('Codificação do registro não suportada.');
  const { encoding: _encoding, ...value } = raw;
  void _encoding;
  const field =
    raw['type'] === 'vault' || raw['type'] === 'account' ? 'value' : 'text';
  const decoded = base64(
    raw[field],
    raw['type'] === 'vault' ? 3_000_000 : 4_300_000,
  );
  try {
    return backupRecord({ ...value, [field]: decoder.decode(decoded) });
  } finally {
    decoded.fill(0);
  }
}
