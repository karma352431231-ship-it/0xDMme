import { AccountError, keys, object, uuid, base64 } from '../account/index.ts';
import { canonical, digest, fingerprint } from '../devices/index.ts';
import { integer } from '../vault/index.ts';
import { roomKeyArchive } from '../messages/index.ts';
import type { RoomKeyArchive } from '../messages/index.ts';
import { viewOnceCipherBytes } from '../view-once/index.ts';
import type { ViewOnceHeader } from '../view-once/index.ts';

export interface GroupViewOnceManifest {
  version: 1;
  scope: 'group';
  id: string;
  sender: string;
  recipient: string;
  epoch: number;
  media: boolean;
  head: string;
  policy: 'mobile' | 'file';
  bytes: number;
  hash: string;
  iv: string;
  recipients: { accountId: string; keyId: string; hash: string }[];
}

export function groupViewOnceManifest(input: unknown): GroupViewOnceManifest {
  const d = object(input);
  keys(d, [
    'version',
    'scope',
    'id',
    'sender',
    'recipient',
    'epoch',
    'media',
    'head',
    'policy',
    'bytes',
    'hash',
    'iv',
    'recipients',
  ]);
  if (
    typeof d['media'] !== 'boolean' ||
    d['version'] !== 1 ||
    d['scope'] !== 'group' ||
    !['mobile', 'file'].includes(String(d['policy'])) ||
    base64(d['iv'], 12).length !== 12
  )
    throw new AccountError(400, 'Invalid group view-once package.');
  const recipients = manifestRecipients(d['recipients']);
  const sender = uuid(d['sender']);
  if (recipients.some((r) => r.accountId === sender))
    throw new AccountError(400, 'Invalid group audience.');
  const epoch = integer(d['epoch'], 100000),
    bytes = integer(d['bytes'], viewOnceCipherBytes);
  if (!epoch || bytes < 16)
    throw new AccountError(400, 'Invalid group view-once package.');
  return {
    media: d['media'],
    version: 1,
    scope: 'group',
    id: uuid(d['id']),
    sender,
    recipient: uuid(d['recipient']),
    epoch,
    head: fingerprint(d['head']),
    policy: d['policy'] as 'mobile' | 'file',
    bytes,
    hash: fingerprint(d['hash']),
    iv: d['iv'] as string,
    recipients,
  };
}

function manifestRecipients(
  input: unknown,
): GroupViewOnceManifest['recipients'] {
  if (!Array.isArray(input) || input.length > 199)
    throw new AccountError(400, 'Invalid group audience.');
  const recipients = input.map((raw: unknown) => {
    const r = object(raw);
    keys(r, ['accountId', 'keyId', 'hash']);
    return {
      accountId: uuid(r['accountId']),
      keyId: uuid(r['keyId']),
      hash: fingerprint(r['hash']),
    };
  });
  if (new Set(recipients.map((r) => r.accountId)).size !== recipients.length)
    throw new AccountError(400, 'Invalid group audience.');
  return recipients;
}

export function groupViewOnceHash(
  manifest: GroupViewOnceManifest,
): Promise<string> {
  return digest(
    canonical(['0xdmme-group-view-once', 1, groupViewOnceManifest(manifest)]),
  );
}

export async function verifyGroupViewOnceDelivery(
  header: ViewOnceHeader,
  raw: unknown,
  hash: string,
  account: string,
): Promise<boolean> {
  const manifest = groupViewOnceManifest(raw);
  const { recipients, epoch, head, media, ...identity } = manifest;
  void media;
  void epoch;
  void head;
  const { key, ...delivery } = header;
  const recipient = recipients.find((r) => r.accountId === account);
  return (
    canonical(identity) === canonical(delivery) &&
    (await groupViewOnceHash(manifest)) === hash &&
    !!recipient &&
    recipient.keyId === key.keyId &&
    key.accountId === account &&
    recipient.hash === (await digest(canonical(key)))
  );
}

export async function groupViewOnceKeys(
  manifest: GroupViewOnceManifest,
  input: unknown,
): Promise<RoomKeyArchive[]> {
  if (!Array.isArray(input) || input.length !== manifest.recipients.length)
    throw new AccountError(400, 'Invalid group keys.');
  const archives = input.map(roomKeyArchive);
  for (const [index, archive] of archives.entries()) {
    const recipient = manifest.recipients[index]!;
    if (
      archive.accountId !== recipient.accountId ||
      archive.keyId !== recipient.keyId ||
      (await digest(canonical(archive))) !== recipient.hash
    )
      throw new AccountError(400, 'Invalid group keys.');
  }
  return archives;
}
