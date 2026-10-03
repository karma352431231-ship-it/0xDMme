import {
  attachmentContent,
  contentRefs,
} from '../../shared/attachments/index.ts';
import {
  CollectStrategy,
  DecryptionSettings,
  DeviceId,
  DeviceLists,
  DecryptedToDeviceEvent,
  EncryptionSettings,
  initAsync,
  KeysClaimRequest,
  KeysQueryRequest,
  KeysUploadRequest,
  LocalTrust,
  OlmMachine,
  RoomId,
  StoreHandle,
  ToDeviceRequest,
  TrustRequirement,
  UserId,
} from '@matrix-org/matrix-sdk-crypto-wasm';
import { object } from '../../shared/account/index.ts';
import { canonical, eventHash } from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import {
  matrixBindingProof,
  matrixDeviceKeys,
  matrixUser,
  messagePacket,
  messageRoom,
  packetProof,
  verifyMatrixBinding,
  verifyPacket,
} from '../../shared/messages/index.ts';
import type {
  MatrixBinding,
  MatrixDeviceKeys,
  MessagePacket,
  RecoveryKey,
} from '../../shared/messages/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { archiveRoomKey } from '../message-recovery/index.ts';
type MatrixOperation =
  'matrix-upload' | 'matrix-query' | 'matrix-claim' | 'matrix-send';
export type MessageTransport = (
  operation: MatrixOperation,
  payload: Record<string, unknown>,
) => Promise<unknown>;
// Tracing payloads may contain protocol data. Errors still reject the operation.
const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
function messageType(kind: MessagePacket['kind']): string {
  return kind === 'text' ? 'm.text' : `org.0xdmme.${kind}`;
}
function attachmentMetadata(
  kind: MessagePacket['kind'] | undefined,
  text: string,
): {
  attachments?: import('../../shared/attachments/index.ts').AttachmentRef[];
} {
  return kind === 'attachment'
    ? {
        attachments: contentRefs(
          attachmentContent(JSON.parse(text) as unknown),
        ),
      }
    : {};
}
function checkAttachmentPacket(packet: MessagePacket, text: string): void {
  if (
    packet.kind === 'attachment' &&
    canonical(contentRefs(attachmentContent(JSON.parse(text) as unknown))) !==
      canonical(packet.attachments)
  )
    throw new Error('Anexos divergentes da mensagem autenticada.');
}
function roomContent(input: {
  text: string;
  id: string;
  account: string;
  peer: string;
  kind: MessagePacket['kind'];
}): string {
  const value = JSON.stringify({
    msgtype: messageType(input.kind),
    body: input.text,
    'org.0xdmme.message': {
      id: input.id,
      sender: input.account,
      recipient: input.peer,
    },
  });
  if (
    new TextEncoder().encode(value).length >
    (input.kind === 'profile' ? 4_010_000 : 3_000_000)
  )
    throw new Error('Conteúdo excede o tamanho permitido.');
  return value;
}

/** One SDK identity/store per authorized device. No ratchet or handshake implemented here. */
export class MessageCrypto {
  private readonly machine: OlmMachine;
  private readonly transport: MessageTransport;
  private readonly contexts = new Map<string, DirectoryEvent[]>();
  private readonly rooms = new Map<string, string>();
  private binding: MatrixBinding | null = null;
  private closed = false;
  private constructor(machine: OlmMachine, transport: MessageTransport) {
    this.machine = machine;
    this.transport = transport;
    machine.roomKeyRequestsEnabled = false;
    machine.roomKeyForwardingEnabled = false;
  }
  static async create(input: {
    accountId: string;
    deviceId: string;
    store: StoreHandle | null;
    transport: MessageTransport;
  }): Promise<MessageCrypto> {
    await initAsync('/matrix-crypto-18.9.0.wasm');
    const machine = input.store
      ? await OlmMachine.initFromStore(
          new UserId(matrixUser(input.accountId)),
          new DeviceId(input.deviceId),
          input.store,
          silentLogger,
        )
      : await OlmMachine.initialize(
          new UserId(matrixUser(input.accountId)),
          new DeviceId(input.deviceId),
          undefined,
          undefined,
          silentLogger,
        );
    return new MessageCrypto(machine, input.transport);
  }
  private assertOpen(): void {
    if (this.closed) throw new Error('Sessão criptográfica encerrada.');
  }
  async prepare(authority: VaultAuthority): Promise<void> {
    this.assertOpen();
    this.contexts.set(
      matrixUser(authority.session.accountId),
      authority.events,
    );
    this.binding = await this.createBinding(authority);
    await this.flush();
  }
  private async createBinding(
    authority: VaultAuthority,
  ): Promise<MatrixBinding> {
    const { accountId, deviceId } = authority.session;
    const identity = this.machine.identityKeys;
    const signing = identity.ed25519,
      curve = identity.curve25519;
    let unsigned: Record<string, unknown>;
    try {
      unsigned = {
        user_id: matrixUser(accountId),
        device_id: deviceId,
        algorithms: ['m.olm.v1.curve25519-aes-sha2', 'm.megolm.v1.aes-sha2'],
        keys: {
          [`ed25519:${deviceId}`]: signing.toBase64(),
          [`curve25519:${deviceId}`]: curve.toBase64(),
        },
      };
    } finally {
      signing.free();
      curve.free();
      identity.free();
    }
    const signatures = await this.machine.sign(canonical(unsigned));
    let publicKeys: MatrixDeviceKeys;
    try {
      publicKeys = matrixDeviceKeys(
        { ...unsigned, signatures: JSON.parse(signatures.asJSON()) as unknown },
        accountId,
        deviceId,
      );
    } finally {
      signatures.free();
    }
    const binding: MatrixBinding = {
      accountId,
      deviceId,
      directory: authority.directory,
      authorityRevision: authority.events.length,
      public: publicKeys,
      signature: '',
    };
    binding.signature = await authority.sign(matrixBindingProof(binding));
    return binding;
  }
  private async flush(): Promise<void> {
    for (const request of await this.machine.outgoingRequests()) {
      try {
        // Other requests require a selected, verified conversation and are
        // dispatched explicitly by trustDevices/getMissingSessions/shareRoomKey.
        if (!(request instanceof KeysUploadRequest)) continue;
        await this.dispatch(request);
      } finally {
        request.free();
      }
    }
  }
  private async dispatch(
    request:
      KeysUploadRequest | KeysQueryRequest | KeysClaimRequest | ToDeviceRequest,
  ): Promise<void> {
    this.assertOpen();
    if (!this.binding) throw new Error('Vínculo do aparelho ausente.');
    const sdk = object(JSON.parse(request.body) as unknown);
    const payload: Record<string, unknown> = { sdk };
    let operation: MatrixOperation;
    if (request instanceof KeysUploadRequest) {
      operation = 'matrix-upload';
      payload['binding'] = this.binding;
    } else if (request instanceof KeysQueryRequest) operation = 'matrix-query';
    else if (request instanceof KeysClaimRequest) operation = 'matrix-claim';
    else {
      operation = 'matrix-send';
      payload['id'] = request.txn_id;
      payload['type'] = request.event_type;
    }
    const result = object(await this.transport(operation, payload));
    this.assertOpen();
    if (operation === 'matrix-query') await this.verifyQuery(result);
    await this.machine.markRequestAsSent(
      request.id,
      request.type,
      JSON.stringify(result['response']),
    );
  }
  private async verifyQuery(result: Record<string, unknown>): Promise<void> {
    if (!Array.isArray(result['bindings']))
      throw new Error('Vínculos de chaves ausentes.');
    const response = object(result['response']),
      devices = object(response['device_keys']);
    const verified = new Map<string, MatrixBinding>();
    for (const input of result['bindings'] as unknown[]) {
      const binding = await this.checkedBinding(input);
      const user = matrixUser(binding.accountId);
      verified.set(`${user}/${binding.deviceId}`, binding);
    }
    for (const [user, value] of Object.entries(devices)) {
      for (const [device, keys] of Object.entries(object(value))) {
        const binding = verified.get(`${user}/${device}`);
        if (!binding || canonical(binding.public) !== canonical(keys))
          throw new Error('Diretório substituiu uma chave Matrix.');
      }
    }
  }
  private async checkedBinding(input: unknown): Promise<MatrixBinding> {
    const raw = object(input),
      history = this.contexts.get(matrixUser(String(raw['accountId']))),
      current = history?.at(-1),
      event = history?.[Number(raw['authorityRevision']) - 1];
    if (!event || !current)
      throw new Error('Autoridade do contato não conferida.');
    const binding = await verifyMatrixBinding(input, event);
    if (!current.devices.some((d) => d.id === binding.deviceId))
      throw new Error('Chave de aparelho revogado.');
    return binding;
  }
  private async trustDevices(history: DirectoryEvent[]): Promise<void> {
    const event = history.at(-1);
    if (!event) throw new Error('Diretório do contato ausente.');
    const user = matrixUser(event.accountId);
    this.contexts.set(user, history);
    const query = this.machine.queryKeysForUsers([new UserId(user)]);
    try {
      await this.dispatch(query);
    } finally {
      query.free();
    }
    for (const identity of event.devices) {
      const device = await this.machine.getDevice(
        new UserId(user),
        new DeviceId(identity.id),
      );
      if (!device) continue; // Never initialized: its recoverable archive remains available.
      try {
        await device.setLocalTrust(LocalTrust.Verified);
      } finally {
        device.free();
      }
    }
  }
  async encrypt(input: {
    authority: VaultAuthority;
    peerHistory: DirectoryEvent[];
    recovery: RecoveryKey[];
    id: string;
    text: string;
    kind?: MessagePacket['kind'];
  }): Promise<MessagePacket> {
    this.assertOpen();
    const { authority, peerHistory, id, text } = input,
      peer = peerHistory.at(-1);
    if (!peer || input.recovery.length !== 2 || !text.trim())
      throw new Error('Destinatário, recuperação ou texto ausente.');
    await this.prepare(authority);
    await this.trustDevices(authority.events);
    await this.trustDevices(peerHistory);
    const room = messageRoom(authority.session.accountId, peer.accountId);
    const membership = canonical([authority.directory, await eventHash(peer)]);
    if (this.rooms.get(room) !== membership)
      await this.machine.invalidateGroupSession(new RoomId(room));
    this.rooms.set(room, membership);
    const users = () => [
      new UserId(matrixUser(authority.session.accountId)),
      new UserId(matrixUser(peer.accountId)),
    ];
    const claim = await this.machine.getMissingSessions(users());
    if (claim) {
      try {
        await this.dispatch(claim);
      } finally {
        claim.free();
      }
    }
    const settings = new EncryptionSettings();
    settings.sharingStrategy = CollectStrategy.onlyTrustedDevices();
    try {
      for (const request of await this.machine.shareRoomKey(
        new RoomId(room),
        users(),
        settings,
      )) {
        try {
          await this.dispatch(request);
        } finally {
          request.free();
        }
      }
    } finally {
      settings.free();
    }
    const value = roomContent({
      text,
      id,
      account: authority.session.accountId,
      peer: peer.accountId,
      kind: input.kind ?? 'text',
    });
    const content = object(
      JSON.parse(
        await this.machine.encryptRoomEvent(
          new RoomId(room),
          'm.room.message',
          value,
        ),
      ) as unknown,
    );
    if (!this.binding) throw new Error('Identidade Matrix de origem ausente.');
    const exported = await this.machine.exportRoomKeys(
      (session) =>
        session.roomId.toString() === room &&
        session.sessionId === content['session_id'],
    );
    const packet: MessagePacket = messagePacket({
      version: 1,
      kind: input.kind ?? 'text',
      ...attachmentMetadata(input.kind, text),
      id,
      sender: authority.session.accountId,
      recipient: peer.accountId,
      deviceId: authority.session.deviceId,
      senderDirectory: authority.directory,
      recipientDirectory: await eventHash(peer),
      senderRevision: authority.events.length,
      recipientRevision: peerHistory.length,
      content,
      binding: this.binding,
      archives: await Promise.all(
        input.recovery.map((key) => archiveRoomKey(key, exported)),
      ),
      signature: 'A'.repeat(86) + '==',
    });
    packet.signature = await authority.sign(packetProof(packet));
    return packet;
  }
  async decrypt(input: {
    packet: MessagePacket;
    senderEvent: DirectoryEvent;
    exported?: string;
  }): Promise<string> {
    this.assertOpen();
    const packet = await verifyPacket(input.packet, input.senderEvent);
    if (input.exported !== undefined) {
      const imported = await this.machine.importExportedRoomKeys(
        input.exported,
        () => {},
      );
      imported.free();
    }
    const room = messageRoom(packet.sender, packet.recipient),
      settings = new DecryptionSettings(TrustRequirement.Untrusted);
    try {
      const event = await this.machine.decryptRoomEvent(
        JSON.stringify({
          type: 'm.room.encrypted',
          event_id: `$${packet.id}`,
          sender: matrixUser(packet.sender),
          origin_server_ts: 0,
          content: packet.content,
        }),
        new RoomId(room),
        settings,
      );
      try {
        if (
          event.senderCurve25519Key !== packet.content.sender_key ||
          event.senderClaimedEd25519Key !==
            packet.binding.public.keys[`ed25519:${packet.deviceId}`]
        )
          throw new Error('Chaves de origem divergentes.');
        const payload = object(
            object(JSON.parse(event.event) as unknown)['content'],
          ),
          identity = object(payload['org.0xdmme.message']);
        if (
          payload['msgtype'] !== messageType(packet.kind) ||
          typeof payload['body'] !== 'string' ||
          identity['id'] !== packet.id ||
          identity['sender'] !== packet.sender ||
          identity['recipient'] !== packet.recipient
        )
          throw new Error('Conteúdo não corresponde à mensagem autenticada.');
        checkAttachmentPacket(packet, payload['body']);
        return payload['body'];
      } finally {
        event.free();
      }
    } finally {
      settings.free();
    }
  }
  async receive(events: unknown[], count: number): Promise<number[]> {
    this.assertOpen();
    const received: number[] = [];
    if (!events.length) await this.receiveEvent([], count);
    for (let index = 0; index < events.length; index++)
      if (await this.receiveEvent([events[index]], count)) received.push(index);
    await this.flush();
    return received;
  }
  private async receiveEvent(
    events: unknown[],
    count: number,
  ): Promise<boolean> {
    const lists = new DeviceLists();
    try {
      const results = await this.machine.receiveSyncChanges(
        JSON.stringify(events),
        lists,
        new Map([['signed_curve25519', count]]),
      );
      try {
        return (
          results.length === 1 && results[0] instanceof DecryptedToDeviceEvent
        );
      } finally {
        for (const result of results) result.free();
      }
    } finally {
      lists.free();
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.contexts.clear();
    this.rooms.clear();
    this.binding = null;
    this.machine.close();
  }
}
