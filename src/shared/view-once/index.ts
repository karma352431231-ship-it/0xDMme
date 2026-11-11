import { AccountError, base64, keys, object, uuid } from '../account/index.ts';
import { canonical, fingerprint } from '../devices/index.ts';
import { roomKeyArchive } from '../messages/index.ts';
import type { RoomKeyArchive } from '../messages/index.ts';
export { viewOnceReference } from '../messages/index.ts';
export type { ViewOnceReference } from '../messages/index.ts';
import { integer } from '../vault/index.ts';

export const viewOnceChunkBytes = 192 * 1024;
export const viewOnceFileBytes = 10_000_000;
export const viewOnceCipherBytes = 14_000_000;
export type ViewOnceScope = 'private' | 'public';
export interface ViewOnceHeader {
  version: 1;
  id: string;
  scope: ViewOnceScope;
  policy: 'mobile' | 'file';
  sender: string;
  recipient: string;
  bytes: number;
  hash: string;
  iv: string;
  key: RoomKeyArchive;
}
export interface ViewOnceContent {
  text: string;
  file?: { name: string; mime: string; data: string };
}

export function viewOnceScope(value: unknown): ViewOnceScope {
  if (value !== 'private' && value !== 'public')
    throw new AccountError(400, 'Invalid view-once conversation.');
  return value;
}
export function viewOnceHeader(input: unknown): ViewOnceHeader {
  const value = object(input);
  keys(value, [
    'version',
    'id',
    'scope',
    'policy',
    'sender',
    'recipient',
    'bytes',
    'hash',
    'iv',
    'key',
  ]);
  if (value['version'] !== 1 || base64(value['iv'], 12).length !== 12)
    throw new AccountError(400, 'Invalid view-once package.');
  const bytes = integer(value['bytes'], viewOnceCipherBytes);
  if (bytes < 16) throw new AccountError(400, 'Invalid view-once package.');
  if (value['policy'] !== 'mobile' && value['policy'] !== 'file')
    throw new AccountError(400, 'Invalid view-once display.');
  const header: ViewOnceHeader = {
    version: 1,
    id: uuid(value['id']),
    scope: viewOnceScope(value['scope']),
    policy: value['policy'],
    sender: uuid(value['sender']),
    recipient: uuid(value['recipient']),
    bytes,
    hash: fingerprint(value['hash']),
    iv: value['iv'] as string,
    key: roomKeyArchive(value['key']),
  };
  if (
    header.sender === header.recipient ||
    header.key.accountId !== header.recipient
  )
    throw new AccountError(400, 'Invalid view-once recipient.');
  return header;
}
export function viewOnceHeaderBody(header: ViewOnceHeader): string {
  return canonical(['0xdmme-view-once', 1, viewOnceHeader(header)]);
}
export function viewOnceContent(input: unknown): ViewOnceContent {
  const result = readViewOnceContent(input);
  result.bytes?.fill(0);
  return result.content;
}
/** Validation and its decoded bytes belong to one operation. Callers must
 * wipe bytes after deriving policy/size; content keeps the canonical format. */
export function readViewOnceContent(input: unknown): {
  content: ViewOnceContent;
  bytes: Uint8Array<ArrayBuffer> | null;
} {
  const value = object(input);
  keys(value, ['text', ...(Object.hasOwn(value, 'file') ? ['file'] : [])]);
  if (
    typeof value['text'] !== 'string' ||
    new TextEncoder().encode(value['text']).length > 16000
  )
    throw new AccountError(400, 'Write up to 16 KB of text.');
  const text = value['text'];
  if (!Object.hasOwn(value, 'file')) {
    if (!text.trim()) throw new AccountError(400, 'Write a message.');
    return { content: { text }, bytes: null };
  }
  const result = contentFile(value['file']);
  return { content: { text, file: result.file }, bytes: result.bytes };
}

function contentFile(input: unknown) {
  const file = object(input);
  keys(file, ['name', 'mime', 'data']);
  if (
    typeof file['name'] !== 'string' ||
    !file['name'] ||
    file['name'].length > 255 ||
    /[\p{Cc}]/u.test(file['name']) ||
    typeof file['mime'] !== 'string' ||
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(file['mime']) ||
    typeof file['data'] !== 'string'
  )
    throw new AccountError(400, 'Invalid view-once file.');
  const bytes = base64(file['data'], viewOnceFileBytes);
  if (!bytes.length) throw new AccountError(400, 'Invalid view-once file.');
  return {
    file: { name: file['name'], mime: file['mime'], data: file['data'] },
    bytes,
  };
}
