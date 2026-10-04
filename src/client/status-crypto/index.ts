import {
  OlmMachine,
  UserId,
  DeviceId,
  RoomId,
  EncryptionSettings,
  DecryptionSettings,
  TrustRequirement,
  initAsync,
} from '@matrix-org/matrix-sdk-crypto-wasm';
import { object } from '../../shared/account/index.ts';
import {
  canonical,
  digest,
  eventHash,
  verifyHistory,
} from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import { matrixUser, verifyRecoveryKey } from '../../shared/messages/index.ts';
import type { RecoveryKey } from '../../shared/messages/index.ts';
import {
  attachmentContent,
  contentRefs,
} from '../../shared/attachments/index.ts';
import type { AttachmentRef } from '../../shared/attachments/index.ts';
import {
  statusPacket,
  statusPacketProof,
  statusEnvelope,
  statusEnvelopeProof,
  statusRoom,
  verifyStatusPacket,
  verifyStatusEnvelope,
  statusIsActive,
} from '../../shared/status/index.ts';
import type {
  StatusPacket,
  StatusEnvelope,
} from '../../shared/status/index.ts';
import { archiveRoomKey } from '../message-recovery/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
interface SealedStatus {
  id: string;
  author: string;
  deviceId: string;
  directory: string;
  authorityRevision: number;
  kind: StatusPacket['kind'];
  content: Record<string, unknown>;
  senderKey: string;
  signingKey: string;
  attachments?: AttachmentRef[];
}
function statusText(
  kind: StatusPacket['kind'],
  text: string,
): AttachmentRef[] | undefined {
  if (!text.trim() || new TextEncoder().encode(text).length > 3_000_000)
    throw new Error('Status vazio ou acima do tamanho permitido.');
  if (kind === 'text') return undefined;
  const photo = attachmentContent(JSON.parse(text) as unknown);
  if (!photo.image || photo.voice)
    throw new Error('Status aceita foto ou texto.');
  return contentRefs(photo);
}
/** A fresh SDK Megolm session per post. Exported keys exist only in memory, never in the chat SDK store or a backup. */
export class StatusEncryption {
  private readonly sealed: SealedStatus;
  private exported: string;
  private constructor(sealed: SealedStatus, exported: string) {
    this.sealed = sealed;
    this.exported = exported;
  }
  static async create(input: {
    authority: VaultAuthority;
    id: string;
    kind: StatusPacket['kind'];
    text: string;
  }): Promise<StatusEncryption> {
    const refs = statusText(input.kind, input.text);
    await initAsync('/matrix-crypto-18.9.0.wasm');
    const { authority, id, kind } = input;
    const machine = await OlmMachine.initialize(
      new UserId(matrixUser(authority.session.accountId)),
      new DeviceId(authority.session.deviceId),
      undefined,
      undefined,
      silentLogger,
    );
    const settings = new EncryptionSettings();
    const room = statusRoom(id);
    try {
      const requests = await machine.shareRoomKey(
        new RoomId(room),
        [],
        settings,
      );
      for (const request of requests) request.free();
      const content = object(
        JSON.parse(
          await machine.encryptRoomEvent(
            new RoomId(room),
            'm.room.message',
            JSON.stringify({
              body: input.text,
              'org.0xdmme.status': {
                id,
                author: authority.session.accountId,
                kind,
              },
            }),
          ),
        ) as unknown,
      );
      const identity = machine.identityKeys;
      const curve = identity.curve25519,
        signing = identity.ed25519;
      try {
        const sealed: SealedStatus = {
          id,
          author: authority.session.accountId,
          deviceId: authority.session.deviceId,
          directory: authority.directory,
          authorityRevision: authority.events.length,
          kind,
          content,
          senderKey: curve.toBase64(),
          signingKey: signing.toBase64(),
          ...(refs ? { attachments: refs } : {}),
        };
        const exported = await machine.exportRoomKeys(
          (key) =>
            key.roomId.toString() === room &&
            key.sessionId === content['session_id'],
        );
        return new StatusEncryption(sealed, exported);
      } finally {
        curve.free();
        signing.free();
        identity.free();
      }
    } finally {
      settings.free();
      machine.close();
    }
  }
  private assertAuthority(authority: VaultAuthority): void {
    if (
      !this.exported ||
      this.sealed.author !== authority.session.accountId ||
      this.sealed.deviceId !== authority.session.deviceId ||
      this.sealed.directory !== authority.directory
    )
      throw new Error('Sessão do status mudou ou foi encerrada.');
  }
  async recipient(input: {
    authority: VaultAuthority;
    history: DirectoryEvent[];
    recovery: RecoveryKey;
  }): Promise<StatusEnvelope> {
    this.assertAuthority(input.authority);
    const { recovery, history } = input;
    const current = await verifyHistory(history, recovery.accountId);
    const signer = history[recovery.authorityRevision - 1];
    if (
      !current ||
      !signer ||
      recovery.epoch !== current.epoch ||
      !current.devices.some((d) => d.id === recovery.deviceId)
    )
      throw new Error('Recuperação do destinatário não está autorizada.');
    await verifyRecoveryKey(recovery, signer);
    const envelope = statusEnvelope({
      version: 1,
      id: this.sealed.id,
      author: this.sealed.author,
      deviceId: this.sealed.deviceId,
      directory: this.sealed.directory,
      authorityRevision: this.sealed.authorityRevision,
      contentHash: await digest(canonical(this.sealed.content)),
      recipient: {
        accountId: recovery.accountId,
        directory: await eventHash(current),
        authorityRevision: current.revision,
        archive: await archiveRoomKey(recovery, this.exported),
      },
      signature: 'A'.repeat(86) + '==',
    });
    envelope.signature = await input.authority.sign(
      statusEnvelopeProof(envelope),
    );
    return envelope;
  }
  async publish(input: {
    authority: VaultAuthority;
    publishedAt: number;
    audienceHead: string;
  }): Promise<StatusPacket> {
    this.assertAuthority(input.authority);
    const packet = statusPacket({
      version: 1,
      ...this.sealed,
      publishedAt: input.publishedAt,
      audienceHead: input.audienceHead,
      signature: 'A'.repeat(86) + '==',
    });
    packet.signature = await input.authority.sign(statusPacketProof(packet));
    return packet;
  }
  close(): void {
    this.exported = '';
  }
}
export async function openStatus(input: {
  authority: VaultAuthority;
  packet: StatusPacket;
  envelope: StatusEnvelope;
  origin: DirectoryEvent;
  exported: string;
  now: number;
}): Promise<string> {
  const packet = await verifyStatusPacket(input.packet, input.origin),
    envelope = await verifyStatusEnvelope(input.envelope, input.origin);
  if (
    !statusIsActive({ publishedAt: packet.publishedAt, now: input.now }) ||
    envelope.id !== packet.id ||
    envelope.author !== packet.author ||
    envelope.recipient.accountId !== input.authority.session.accountId ||
    envelope.contentHash !== (await digest(canonical(packet.content)))
  )
    throw new Error('Status expirado ou fora da audiência autorizada.');
  await initAsync('/matrix-crypto-18.9.0.wasm');
  const machine = await OlmMachine.initialize(
    new UserId(matrixUser(input.authority.session.accountId)),
    new DeviceId(input.authority.session.deviceId),
    undefined,
    undefined,
    silentLogger,
  );
  const settings = new DecryptionSettings(TrustRequirement.Untrusted);
  try {
    const imported = await machine.importExportedRoomKeys(
      input.exported,
      () => {},
    );
    imported.free();
    const event = await machine.decryptRoomEvent(
      JSON.stringify({
        type: 'm.room.encrypted',
        event_id: `$${packet.id}`,
        sender: matrixUser(packet.author),
        origin_server_ts: packet.publishedAt,
        content: packet.content,
      }),
      new RoomId(statusRoom(packet.id)),
      settings,
    );
    try {
      if (
        event.senderCurve25519Key !== packet.senderKey ||
        event.senderClaimedEd25519Key !== packet.signingKey
      )
        throw new Error('Chave de origem de status divergente.');
      return openedStatusText(packet, event.event);
    } finally {
      event.free();
    }
  } finally {
    settings.free();
    machine.close();
  }
}
function openedStatusText(packet: StatusPacket, event: string): string {
  const payload = object(object(JSON.parse(event) as unknown)['content']),
    identity = object(payload['org.0xdmme.status']);
  if (
    identity['id'] !== packet.id ||
    identity['author'] !== packet.author ||
    identity['kind'] !== packet.kind ||
    typeof payload['body'] !== 'string'
  )
    throw new Error('Conteúdo de status divergente.');
  const refs = statusText(packet.kind, payload['body']);
  if (canonical(refs ?? null) !== canonical(packet.attachments ?? null))
    throw new Error('Mídia de status divergente.');
  return payload['body'];
}
