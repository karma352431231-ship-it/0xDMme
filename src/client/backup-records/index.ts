import {
  base64,
  boundedText,
  encode,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { fingerprint, canonical, digest } from '../../shared/devices/index.ts';
import { groupEvent } from '../../shared/groups/index.ts';
import type { GroupEvent } from '../../shared/groups/index.ts';
import { groupTitle } from '../../shared/group-messages/index.ts';
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
  | {
      type: 'group';
      id: string;
      hash: string;
      state: GroupEvent;
      title: string;
      profileSequence: number;
    }
  | {
      type: 'group-message';
      id: string;
      hash: string;
      groupId: string;
      sequence: number;
      epoch: number;
      sender: string;
      own: boolean;
      kind: 'text' | 'profile' | 'attachment';
      text: string;
    }
  | {
      type: 'group-media';
      id: string;
      hash: string;
      groupId: string;
      message: string;
      thumbnail: boolean;
      bytes: string;
    }
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
export function groupSnapshotHash(row: {
  state: GroupEvent;
  title: string;
  profileSequence: number;
}): Promise<string> {
  return digest(
    canonical({
      state: row.state,
      title: row.title,
      profileSequence: row.profileSequence,
    }),
  );
}
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
  const group = groupBackupRecord(d, id, hash);
  if (group) return group;
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
function groupBackupRecord(
  d: Record<string, unknown>,
  id: string,
  hash: string,
): BackupRecord | null {
  const type = d['type'];
  if (type === 'group') {
    keys(d, ['type', 'id', 'hash', 'state', 'title', 'profileSequence']);
    return {
      type,
      id,
      hash,
      state: groupEvent(d['state']),
      title: groupTitle({ version: 1, title: d['title'] }),
      profileSequence: integer(d['profileSequence'], Number.MAX_SAFE_INTEGER),
    };
  }
  if (type === 'group-message') return groupMessageRecord(d, id, hash);
  if (type === 'group-media') {
    keys(d, ['type', 'id', 'hash', 'groupId', 'message', 'thumbnail', 'bytes']);
    if (typeof d['thumbnail'] !== 'boolean')
      throw new Error('Mídia de grupo inválida.');
    const bytes = base64(d['bytes'], fileLimit);
    if (!bytes.length) throw new Error('Mídia vazia.');
    return {
      type,
      id,
      hash,
      groupId: uuid(d['groupId']),
      message: uuid(d['message']),
      thumbnail: d['thumbnail'],
      bytes: encode(bytes),
    };
  }
  return null;
}
function groupMessageRecord(
  d: Record<string, unknown>,
  id: string,
  hash: string,
): Extract<BackupRecord, { type: 'group-message' }> {
  keys(d, [
    'type',
    'id',
    'hash',
    'groupId',
    'sequence',
    'epoch',
    'sender',
    'own',
    'kind',
    'text',
  ]);
  const kind = d['kind'],
    text = boundedText(d['text'], backupRecordLimit);
  if (
    typeof d['own'] !== 'boolean' ||
    (kind !== 'text' && kind !== 'profile' && kind !== 'attachment')
  )
    throw new Error('Mensagem histórica de grupo inválida.');
  if (kind === 'profile') groupTitle(JSON.parse(text) as unknown);
  else validateContent(kind, text);
  return {
    type: 'group-message',
    id,
    hash,
    groupId: uuid(d['groupId']),
    sequence: integer(d['sequence'], Number.MAX_SAFE_INTEGER),
    epoch: integer(d['epoch'], 100_000),
    sender: uuid(d['sender']),
    own: d['own'],
    kind,
    text,
  };
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
  if (row.type !== 'message' && row.type !== 'vault') return null;
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
      : row.type === 'message' || row.type === 'group-message'
        ? 'text'
        : null;
  const encoder = new TextEncoder();
  if (!field) return encoder.encode(JSON.stringify(row));
  const bytes = encoder.encode(
    row.type === 'vault' || row.type === 'account'
      ? row.value
      : row.type === 'message' || row.type === 'group-message'
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
  if (['media', 'group', 'group-media'].includes(String(raw['type'])))
    return backupRecord(raw);
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
