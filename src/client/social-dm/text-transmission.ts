import { ApiResponseError } from '../api-response/index.ts';
import type { MessageRelation } from '../../shared/daily/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import { recoveryKey } from '../../shared/messages/index.ts';
import type { MessagePacket } from '../../shared/messages/index.ts';
import { ensureMessageRecovery } from '../message-recovery/index.ts';
import { readSocialDirectory } from './authority.ts';
import type { SocialContext } from './crypto-context.ts';

export interface TextTransmission {
  id: string;
  peer: string;
  text: string;
  relation?: MessageRelation;
  packet: MessagePacket | null;
  preserve: (packet: MessagePacket) => Promise<void>;
}

/** A persisted packet is an uncertain retry; a fresh draft has never published.
 * The server atomically rechecks current directories and idempotency at publish. */
export async function transmitSocialText(
  context: SocialContext,
  input: TextTransmission,
): Promise<void> {
  const { authority, api, machine } = context;
  let packet = input.packet;
  if (
    packet &&
    (await api('accepted', {
      id: packet.id,
      hash: await digest(canonical(packet)),
    }))
  )
    return;
  const peer = await sendPeer(context, input.peer);
  if (
    !packet ||
    packet.senderDirectory !== authority.directory ||
    packet.recipientRevision !== peer.directory.events.length
  ) {
    const own = await ensureMessageRecovery(authority, api);
    packet = await machine.encrypt({
      authority,
      peerHistory: peer.directory.events,
      recovery: [own, peer.recovery],
      id: input.id,
      text: input.text,
      ...(input.relation ? { relation: input.relation } : {}),
    });
    await input.preserve(packet);
  }
  try {
    await api('publish', { packet });
  } catch (error: unknown) {
    await retryChangedRecipient(context, { ...input, packet }, error);
  }
}

/** Retry only a definite publication refusal caused by a newly signed peer
 * directory, once. Unknown failures keep the retained packet for reconciliation. */
async function retryChangedRecipient(
  context: SocialContext,
  input: TextTransmission & { packet: MessagePacket },
  error: unknown,
): Promise<void> {
  if (
    !(error instanceof ApiResponseError) ||
    error.status !== 409 ||
    error.reason !== 'Identity or devices changed. Encrypt again.'
  )
    throw error;
  context.sendPeers.delete(input.peer);
  const peer = await sendPeer(context, input.peer);
  if (peer.directory.events.length === input.packet.recipientRevision)
    throw error;
  const packet = await context.machine.encrypt({
    authority: context.authority,
    peerHistory: peer.directory.events,
    recovery: [
      await ensureMessageRecovery(context.authority, context.api),
      peer.recovery,
    ],
    id: input.id,
    text: input.text,
    ...(input.relation ? { relation: input.relation } : {}),
  });
  await input.preserve(packet);
  await context.api('publish', { packet });
}

/** One authenticated burst pins each peer once; publication still checks the
 * current directories atomically and refuses a change before acceptance. */
async function sendPeer(context: SocialContext, peer: string) {
  const held = context.sendPeers.get(peer);
  if (held) return held;
  const directory = await readSocialDirectory(context.api, peer);
  const raw = await context.api('recovery-peer', { accountId: peer });
  if (raw === null)
    throw new Error(
      'The recipient must open Handle messages in this app to prepare E2EE recovery.',
    );
  const result = { directory, recovery: recoveryKey(raw) };
  context.sendPeers.set(peer, result);
  while (context.sendPeers.size > 32)
    context.sendPeers.delete(context.sendPeers.keys().next().value!);
  return result;
}
