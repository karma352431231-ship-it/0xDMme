import { object, uuid } from '../../shared/account/index.ts';
import {
  canonical,
  digest,
  eventHash,
  fingerprint,
  verifyHistory,
  verify,
} from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import {
  messageBody,
  messageKind,
  messageProof,
  messagePageSize,
} from '../../shared/messages/index.ts';
import type { MessageProof } from '../../shared/messages/index.ts';
import { integer } from '../../shared/vault/index.ts';
export interface MessageItem {
  kind: 'text' | 'profile' | 'attachment';
  id: string;
  sender: string;
  recipient: string;
  sequence: number;
  hash: string;
  deleted: boolean;
  deletion: MessageProof | null;
  sender_revision: number;
  recipient_revision: number;
  queue_active: boolean;
  status: 'pending' | 'received' | 'revoked' | null;
}
export interface PeerPin {
  fingerprint: string;
  directory: string;
  revision: number;
}
export type Api = (
  operation: string,
  payload: Record<string, unknown>,
) => Promise<unknown>;
export async function peerHistory(
  api: Api,
  account: string,
  through: number | null,
  pin: PeerPin | null,
): Promise<DirectoryEvent[]> {
  const events: unknown[] = [];
  let expected: string | null = null;
  for (let page = 0; page < 16; page++) {
    const result = await api(through === null ? 'peer-directory' : 'history', {
      accountId: account,
      after: events.length,
      ...(through === null ? {} : { through }),
    });
    const raw = through === null ? object(result)['events'] : result;
    assertHistoryPage(raw);
    events.push(...raw);
    const revision = through ?? integer(object(result)['revision'], 128);
    if (through === null) expected = fingerprint(object(result)['head']);
    if (events.length !== revision) continue;
    return verifiedPeer({
      events,
      account,
      expected,
      pin,
      current: through === null,
    });
  }
  throw new Error('Diretório incompleto.');
}
function assertHistoryPage(raw: unknown): asserts raw is unknown[] {
  if (!Array.isArray(raw) || raw.length > 8 || !raw.length)
    throw new Error('Diretório omitido ou inválido.');
}
async function verifiedPeer(c: {
  events: unknown[];
  account: string;
  expected: string | null;
  pin: PeerPin | null;
  current: boolean;
}): Promise<DirectoryEvent[]> {
  const last = await verifyHistory(c.events, c.account);
  if (!last) throw new Error('Diretório ausente.');
  if (c.expected !== null && (await eventHash(last)) !== c.expected)
    throw new Error('Diretório divergente.');
  const checked = c.events as DirectoryEvent[],
    pin = await pinFor(checked);
  if (c.pin)
    await checkPeerPin({
      known: c.pin,
      pin,
      history: checked,
      current: c.current,
    });
  return checked;
}
async function checkPeerPin(c: {
  known: PeerPin;
  pin: PeerPin;
  history: DirectoryEvent[];
  current: boolean;
}): Promise<void> {
  if (c.known.fingerprint !== c.pin.fingerprint)
    throw new Error(
      'Identidade do contato mudou. Confira com ele antes de continuar.',
    );
  if (c.current && c.pin.revision < c.known.revision)
    throw new Error('Diretório antigo do contato.');
  const pinned = c.history[c.known.revision - 1];
  if (pinned && (await eventHash(pinned)) !== c.known.directory)
    throw new Error('Diretório diverge da identidade fixada.');
}
export async function pinFor(history: DirectoryEvent[]): Promise<PeerPin> {
  const first = history[0],
    last = history.at(-1);
  if (!first || !last) throw new Error('Diretório ausente.');
  return {
    fingerprint: await digest(
      canonical([first.root.signing, first.root.wrapping]),
    ),
    directory: await eventHash(last),
    revision: last.revision,
  };
}
export function messageItems(input: unknown): {
  items: MessageItem[];
  next: number | null;
} {
  const data = object(input),
    raw = data['items'];
  if (!Array.isArray(raw) || raw.length > messagePageSize)
    throw new Error('Índice de mensagens inválido.');
  const items = raw.map((value) => {
    const row = object(value);
    if (
      typeof row['deleted'] !== 'boolean' ||
      typeof row['queue_active'] !== 'boolean' ||
      !['pending', 'received', 'revoked', null].includes(
        row['status'] as string | null,
      )
    )
      throw new Error('Estado de mensagem inválido.');
    return {
      kind: messageKind(row['kind']),
      id: uuid(row['id']),
      sender: uuid(row['sender']),
      recipient: uuid(row['recipient']),
      sequence: integer(row['sequence'], Number.MAX_SAFE_INTEGER),
      hash: fingerprint(row['hash']),
      deleted: row['deleted'],
      deletion: row['deletion'] === null ? null : messageProof(row['deletion']),
      sender_revision: integer(row['sender_revision'], 128),
      recipient_revision: integer(row['recipient_revision'], 128),
      queue_active: row['queue_active'],
      status: row['status'] as MessageItem['status'],
    };
  });
  return {
    items,
    next:
      data['next'] === null
        ? null
        : integer(data['next'], Number.MAX_SAFE_INTEGER),
  };
}
export async function verifyDeletion(
  item: MessageItem,
  history: DirectoryEvent[],
): Promise<void> {
  const proof = item.deletion,
    revision = Number(proof?.payload['revision']),
    event = history[revision - 1],
    device = event?.devices.find((d) => d.id === proof?.deviceId);
  if (
    !proof ||
    !event ||
    !device ||
    event.accountId !== item.sender ||
    (await eventHash(event)) !== proof.directory ||
    proof.payload['id'] !== item.id ||
    proof.payload['hash'] !== item.hash
  )
    throw new Error('Exclusão não autenticada.');
  await verify(
    device.signing,
    proof.signature,
    messageBody(item.sender, proof.deviceId, 'delete', proof),
  );
}
