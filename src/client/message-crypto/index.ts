import type { PrivateAudiences } from './audiences.ts';
export { PrivateAudiences } from './audiences.ts';
export { GroupSendBatch } from './group-batch.ts';
import type { GroupSendBatch } from './group-batch.ts';
import { prepareMessageRuntime } from '../message-runtime/index.ts';
import { socialAttachment } from '../../shared/social-media/index.ts';
import { optionalRelation } from '../../shared/daily/index.ts';
import {
  assertGroupPacketPeriod,
  groupPacket,
  groupPacketProof,
  groupKeys,
  groupKeysHash,
  groupKeysProof,
  verifyGroupKeys,
  verifyGroupPacket,
} from '../../shared/group-messages/index.ts';
import type {
  GroupDestination,
  GroupEncryptedMessage,
  GroupKeys,
  GroupPacket,
} from '../../shared/group-messages/index.ts';
import {
  groupCanRead,
  groupEventHash,
  groupRoom,
} from '../../shared/groups/index.ts';
import type { GroupEvent } from '../../shared/groups/index.ts';
import { groupTransport } from './group-transport.ts';
import type { MatrixOperation, MessageTransport } from './transport.ts';
export type { MessageTransport } from './transport.ts';
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
import { messagePresentation } from '../../shared/message-presentation/index.ts';
import type { MessagePresentation } from '../../shared/message-presentation/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import {
  archiveRoomKey,
  currentRecoveryKey,
} from '../message-recovery/index.ts';
export interface GroupEncryptionInput {
  /** Shares device trust with earlier messages of the same send batch. */
  batch?: GroupSendBatch;
  authority: VaultAuthority;
  state: GroupEvent;
  histories: DirectoryEvent[][];
  recovery: RecoveryKey[];
  transport: MessageTransport;
  id: string;
  text: string;
  kind?: GroupPacket['kind'];
  existingKeys?: GroupKeys;
  relation?: import('../../shared/daily/index.ts').MessageRelation;
}
// Tracing payloads may contain protocol data. Errors still reject the operation.
const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
function declaredMedia(media: MessagePacket['socialMedia']): {
  socialMedia?: NonNullable<MessagePacket['socialMedia']>;
} {
  return media ? { socialMedia: media } : {};
}
function messageType(kind: MessagePacket['kind']): string {
  return kind === 'text' ? 'm.text' : `org.0xdmme.${kind}`;
}
function attachmentMetadata(
  kind: MessagePacket['kind'] | undefined,
  text: string,
  media?: MessagePacket['socialMedia'],
): {
  attachments?: import('../../shared/attachments/index.ts').AttachmentRef[];
} {
  return kind === 'attachment'
    ? {
        attachments: contentRefs(
          media
            ? socialAttachment(JSON.parse(text) as unknown, media)
            : attachmentContent(JSON.parse(text) as unknown),
        ),
      }
    : {};
}
function checkAttachmentPacket(packet: MessagePacket, text: string): void {
  if (
    packet.kind === 'attachment' &&
    canonical(
      contentRefs(
        packet.socialMedia
          ? socialAttachment(JSON.parse(text) as unknown, packet.socialMedia)
          : attachmentContent(JSON.parse(text) as unknown),
      ),
    ) !== canonical(packet.attachments)
  )
    throw new Error('Attachments differ from the authenticated message.');
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
      presentation: { version: 1, sentAt: Date.now() },
    },
  });
  if (
    new TextEncoder().encode(value).length >
    (input.kind === 'profile' ? 4_010_000 : 3_000_000)
  )
    throw new Error('Content exceeds the permitted size.');
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
  private sending: Promise<void> = Promise.resolve();
  private lastGroupKeys: GroupKeys | null = null;
  private readonly audiences: PrivateAudiences | null;
  private constructor(
    machine: OlmMachine,
    transport: MessageTransport,
    audiences: PrivateAudiences | null,
  ) {
    this.machine = machine;
    this.transport = transport;
    this.audiences = audiences;
    machine.roomKeyRequestsEnabled = false;
    machine.roomKeyForwardingEnabled = false;
  }
  static async create(input: {
    accountId: string;
    deviceId: string;
    store: StoreHandle | null;
    transport: MessageTransport;
    /** Session-scoped private audiences; without it each wrapper rotates. */
    audiences?: PrivateAudiences;
  }): Promise<MessageCrypto> {
    await prepareMessageRuntime();
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
    return new MessageCrypto(machine, input.transport, input.audiences ?? null);
  }
  private assertOpen(): void {
    if (this.closed) throw new Error('Cryptographic session ended.');
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
        // The SDK's own tracked query must complete too: manual queries do not
        // clear its pending flag. Never dispatch queued queries for other users
        // here; they need the selected conversation's verified scope/transport.
        if (
          !(request instanceof KeysUploadRequest) &&
          !(request instanceof KeysQueryRequest && this.ownKeyQuery(request))
        )
          continue;
        await this.dispatch(request);
      } finally {
        request.free();
      }
    }
  }
  private ownKeyQuery(request: KeysQueryRequest): boolean {
    if (!this.binding) return false;
    const users = Object.keys(
      object(object(JSON.parse(request.body) as unknown)['device_keys']),
    );
    return (
      users.length === 1 && users[0] === matrixUser(this.binding.accountId)
    );
  }
  private async dispatch(
    request:
      KeysUploadRequest | KeysQueryRequest | KeysClaimRequest | ToDeviceRequest,
    transport: MessageTransport = this.transport,
  ): Promise<void> {
    this.assertOpen();
    if (!this.binding) throw new Error('Device binding missing.');
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
    const result = object(await transport(operation, payload));
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
      throw new Error('Key bindings missing.');
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
          throw new Error('Directory replaced a Matrix key.');
      }
    }
  }
  private async checkedBinding(input: unknown): Promise<MatrixBinding> {
    const raw = object(input),
      history = this.contexts.get(matrixUser(String(raw['accountId']))),
      current = history?.at(-1),
      event = history?.[Number(raw['authorityRevision']) - 1];
    if (!event || !current)
      throw new Error('Contact authority has not been verified.');
    const binding = await verifyMatrixBinding(input, event);
    if (!current.devices.some((d) => d.id === binding.deviceId))
      throw new Error('Key belongs to a revoked device.');
    return binding;
  }
  private async trustDevices(
    history: DirectoryEvent[],
    transport: MessageTransport = this.transport,
  ): Promise<void> {
    const event = history.at(-1);
    if (!event) throw new Error('Contact directory missing.');
    const user = matrixUser(event.accountId);
    this.contexts.set(user, history);
    const query = this.machine.queryKeysForUsers([new UserId(user)]);
    try {
      await this.dispatch(query, transport);
    } finally {
      query.free();
    }
    await this.trustKnownDevices(event);
  }
  private async trustKnownDevices(event: DirectoryEvent): Promise<void> {
    const user = matrixUser(event.accountId);
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
    socialMedia?: MessagePacket['socialMedia'];
    authority: VaultAuthority;
    peerHistory: DirectoryEvent[];
    recovery: RecoveryKey[];
    id: string;
    text: string;
    kind?: MessagePacket['kind'];
    relation?: MessagePacket['relation'];
  }): Promise<MessagePacket> {
    return this.serializeSend(() => this.encryptIndividual(input));
  }
  private serializeSend<T>(send: () => Promise<T>): Promise<T> {
    const job = this.sending.then(send);
    this.sending = job.then(
      () => {},
      () => {},
    );
    return job;
  }
  private identityKey(): string {
    const keys = this.machine.identityKeys,
      curve = keys.curve25519;
    try {
      return curve.toBase64();
    } finally {
      curve.free();
      keys.free();
    }
  }
  /** Keep the SDK's outbound session only while this identity already shared
   * it with the same audience in this wrapper or signed-in session. */
  private async rotateChangedAudience(
    room: string,
    membership: string,
  ): Promise<string> {
    const identity = this.identityKey();
    if (
      this.rooms.get(room) !== membership &&
      !this.audiences?.matches(identity, room, membership)
    )
      await this.machine.invalidateGroupSession(new RoomId(room));
    this.rooms.set(room, membership);
    return identity;
  }
  private async encryptIndividual(
    input: Parameters<MessageCrypto['encrypt']>[0],
  ): Promise<MessagePacket> {
    this.assertOpen();
    const { authority, peerHistory, id, text } = input,
      peer = peerHistory.at(-1);
    if (!peer || input.recovery.length !== 2 || !text.trim())
      throw new Error('Recipient, recovery or text missing.');
    await currentRecoveryKey(
      input.recovery[0],
      authority.events,
      authority.session.accountId,
    );
    await currentRecoveryKey(input.recovery[1], peerHistory, peer.accountId);
    await this.prepare(authority);
    await this.trustDevices(authority.events);
    await this.trustDevices(peerHistory);
    const room = messageRoom(authority.session.accountId, peer.accountId);
    const membership = canonical([authority.directory, await eventHash(peer)]);
    const identity = await this.rotateChangedAudience(room, membership);
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
    this.audiences?.remember(identity, room, membership);
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
    if (!this.binding) throw new Error('Source Matrix identity missing.');
    const exported = await this.machine.exportRoomKeys(
      (session) =>
        session.roomId.toString() === room &&
        session.sessionId === content['session_id'],
    );
    const packet: MessagePacket = messagePacket({
      version: 1,
      ...declaredMedia(input.socialMedia),
      kind: input.kind ?? 'text',
      ...optionalRelation(input.relation),
      ...attachmentMetadata(input.kind, text, input.socialMedia),
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
  encryptGroup(input: GroupEncryptionInput): Promise<GroupEncryptedMessage> {
    return this.serializeSend(() => this.encryptGroupMessage(input));
  }
  private async encryptGroupMessage(
    input: GroupEncryptionInput,
  ): Promise<GroupEncryptedMessage> {
    this.assertOpen();
    await this.prepare(input.authority);
    const histories = await this.groupHistories(input);
    const transport = groupTransport(input.transport);
    const room = groupRoom(input.state.groupId, input.state.epoch);
    const destinations = await Promise.all(
      histories.map(async (history) => {
        const event = history.at(-1);
        if (!event) throw new Error('Group directory missing.');
        return {
          accountId: event.accountId,
          directory: await eventHash(event),
          authorityRevision: event.revision,
        };
      }),
    );
    await this.trustForBatch(input, { histories, transport, destinations });
    const membership = canonical([
      destinations,
      input.recovery.map((key) => key.id),
    ]);
    await this.restoreGroupSession(input, { room, destinations, membership });
    if (this.rooms.get(room) !== membership)
      await this.machine.invalidateGroupSession(new RoomId(room));
    this.rooms.set(room, membership);
    await this.shareGroupSession({
      room,
      accounts: destinations.map((d) => d.accountId),
      transport,
    });
    const text = this.groupContent(input);
    const content = object(
      JSON.parse(
        await this.machine.encryptRoomEvent(
          new RoomId(room),
          'm.room.message',
          text,
        ),
      ) as unknown,
    );
    if (!this.binding) throw new Error('Matrix binding missing.');
    const bundle = await this.groupSessionKeys(input, {
      content,
      destinations,
      room,
    });
    const packet = groupPacket({
      version: 1,
      id: input.id,
      groupId: input.state.groupId,
      head: await groupEventHash(input.state),
      epoch: input.state.epoch,
      kind: input.kind ?? 'text',
      sender: input.authority.session.accountId,
      deviceId: input.authority.session.deviceId,
      binding: bundle.binding,
      content,
      directory: input.authority.directory,
      authorityRevision: input.authority.events.length,
      keyHash: await groupKeysHash(bundle),
      ...(input.relation ? { relation: input.relation } : {}),
      ...attachmentMetadata(input.kind, input.text),
      signature: 'A'.repeat(86) + '==',
    });
    packet.signature = await input.authority.sign(groupPacketProof(packet));
    return { packet, keys: bundle };
  }
  /** Encrypted local checkpoints restore only a bundle for this SDK identity and the current full audience. */
  private async restoreGroupSession(
    input: GroupEncryptionInput,
    session: {
      room: string;
      destinations: GroupDestination[];
      membership: string;
    },
  ): Promise<void> {
    const cached = input.existingKeys;
    if (!cached || this.rooms.has(session.room)) return;
    if (
      !this.groupCheckpointMatches(input, {
        cached,
        destinations: session.destinations,
      })
    )
      return;
    const signer = input.authority.events[cached.binding.authorityRevision - 1];
    if (!signer) throw new Error('Group session authority missing.');
    await verifyGroupKeys(cached, signer);
    if (cached.head !== (await groupEventHash(input.state))) return;
    this.rooms.set(session.room, session.membership);
    this.lastGroupKeys = cached;
  }
  private groupCheckpointMatches(
    input: GroupEncryptionInput,
    session: { cached: GroupKeys; destinations: GroupDestination[] },
  ): boolean {
    if (!this.binding) throw new Error('Matrix identity not prepared.');
    const cached = session.cached;
    const origin = [
      cached.groupId,
      cached.epoch,
      cached.sender,
      cached.deviceId,
      cached.binding.directory,
      canonical(cached.binding.public.keys),
    ];
    const current = [
      input.state.groupId,
      input.state.epoch,
      input.authority.session.accountId,
      input.authority.session.deviceId,
      input.authority.directory,
      canonical(this.binding.public.keys),
    ];
    return (
      canonical(origin) === canonical(current) &&
      canonical(cached.destinations) === canonical(session.destinations) &&
      canonical(cached.archives.map((a) => [a.accountId, a.keyId])) ===
        canonical(input.recovery.map((key) => [key.accountId, key.id]))
    );
  }
  private async groupSessionKeys(
    input: GroupEncryptionInput,
    session: {
      content: Record<string, unknown>;
      destinations: GroupDestination[];
      room: string;
    },
  ): Promise<GroupKeys> {
    const cached = this.lastGroupKeys;
    if (
      cached &&
      cached.sessionId === session.content['session_id'] &&
      cached.groupId === input.state.groupId &&
      cached.epoch === input.state.epoch
    )
      return cached;
    if (!this.binding) throw new Error('Matrix binding missing.');
    const exported = await this.machine.exportRoomKeys(
      (key) =>
        key.roomId.toString() === session.room &&
        key.sessionId === session.content['session_id'],
    );
    const bundle = groupKeys({
      version: 1,
      groupId: input.state.groupId,
      head: await groupEventHash(input.state),
      epoch: input.state.epoch,
      sender: input.authority.session.accountId,
      deviceId: input.authority.session.deviceId,
      sessionId: session.content['session_id'],
      binding: this.binding,
      destinations: session.destinations,
      archives: await Promise.all(
        input.recovery.map((key) => archiveRoomKey(key, exported)),
      ),
      signature: 'A'.repeat(86) + '==',
    });
    bundle.signature = await input.authority.sign(groupKeysProof(bundle));
    this.lastGroupKeys = bundle;
    return bundle;
  }
  private async groupHistories(
    input: GroupEncryptionInput,
  ): Promise<DirectoryEvent[][]> {
    if (
      !groupCanRead(
        input.state,
        input.authority.session.accountId,
        input.state.epoch,
      ) ||
      !input.text.trim()
    )
      throw new Error('Group has no current membership or content.');
    const histories = input.histories,
      accounts = histories.map(historyAccount);
    if (
      canonical(accounts) !==
        canonical(input.state.members.map((m) => m.accountId)) ||
      input.recovery.length !== histories.length
    )
      throw new Error('Audience or recovery incomplete.');
    for (const [index, history] of histories.entries())
      await this.checkGroupRecovery({
        history,
        account: accounts[index],
        recovery: input.recovery[index],
      });
    await this.checkGroupOrigin(histories, input.authority);
    return histories;
  }
  private async checkGroupOrigin(
    histories: DirectoryEvent[][],
    authority: VaultAuthority,
  ): Promise<void> {
    const own = histories
      .find((h) => historyAccount(h) === authority.session.accountId)
      ?.at(-1);
    if (!own || (await eventHash(own)) !== authority.directory)
      throw new Error('Source directory changed.');
  }
  private async checkGroupRecovery(input: {
    history: DirectoryEvent[];
    account: string | undefined;
    recovery: RecoveryKey | undefined;
  }): Promise<void> {
    const { account, recovery, history } = input;
    if (!account || !recovery) throw new Error('Member recovery missing.');
    await currentRecoveryKey(recovery, history, account);
  }
  private async claimGroupSessions(
    accounts: string[],
    transport: MessageTransport,
  ): Promise<void> {
    const claim = await this.machine.getMissingSessions(
      accounts.map((a) => new UserId(matrixUser(a))),
    );
    if (!claim) return;
    try {
      await this.dispatch(claim, transport);
    } finally {
      claim.free();
    }
  }
  /** Queries members' Matrix devices unless this batch already did so for
   * exactly the same period, members, directories, recovery and sender. */
  private async trustForBatch(
    input: GroupEncryptionInput,
    trust: {
      histories: DirectoryEvent[][];
      transport: MessageTransport;
      destinations: GroupDestination[];
    },
  ): Promise<void> {
    const key = canonical([
      input.state.groupId,
      input.state.epoch,
      await groupEventHash(input.state),
      trust.destinations,
      input.recovery.map((recovery) => recovery.id),
      input.authority.session.deviceId,
      input.authority.directory,
    ]);
    const reused = input.batch?.covers(key) ?? false;
    if (!reused) await this.trustGroupDevices(trust.histories, trust.transport);
    input.batch?.used(key, !reused);
  }
  private async trustGroupDevices(
    histories: DirectoryEvent[][],
    transport: MessageTransport,
  ): Promise<void> {
    const accounts = histories.map(historyAccount);
    for (const [index, history] of histories.entries()) {
      const account = accounts[index];
      if (!account) throw new Error('Group account missing.');
      this.contexts.set(matrixUser(account), history);
    }
    const query = this.machine.queryKeysForUsers(
      accounts.map((account) => new UserId(matrixUser(account))),
    );
    try {
      await this.dispatch(query, transport);
    } finally {
      query.free();
    }
    for (const history of histories) {
      const current = history.at(-1);
      if (!current) throw new Error('Group directory missing.');
      await this.trustKnownDevices(current);
    }
  }
  private async shareGroupSession(input: {
    room: string;
    accounts: string[];
    transport: MessageTransport;
  }): Promise<void> {
    const settings = new EncryptionSettings();
    settings.sharingStrategy = CollectStrategy.onlyTrustedDevices();
    try {
      await this.claimGroupSessions(input.accounts, input.transport);
      // Supply the complete membership once; transport batches must not be
      // mistaken by the SDK for changes to the room's membership.
      for (const request of await this.machine.shareRoomKey(
        new RoomId(input.room),
        input.accounts.map((a) => new UserId(matrixUser(a))),
        settings,
      )) {
        try {
          await this.dispatch(request, input.transport);
        } finally {
          request.free();
        }
      }
    } finally {
      settings.free();
    }
  }
  private groupContent(input: GroupEncryptionInput): string {
    const content = JSON.stringify({
      msgtype: messageType(input.kind ?? 'text'),
      body: input.text,
      'org.0xdmme.group': {
        id: input.id,
        sender: input.authority.session.accountId,
        groupId: input.state.groupId,
        epoch: input.state.epoch,
        ...(input.relation ? { relation: input.relation } : {}),
      },
    });
    if (new TextEncoder().encode(content).length > 3_000_000)
      throw new Error('Group content exceeds the limit.');
    return content;
  }
  async decryptGroup(input: {
    packet: GroupPacket;
    keys: GroupKeys;
    period: GroupEvent;
    senderEvent: DirectoryEvent;
    exported?: string;
  }): Promise<string> {
    this.assertOpen();
    const packet = await verifyGroupPacket(input.packet, input.senderEvent);
    const bundle = await verifyGroupKeys(input.keys, input.senderEvent);
    await assertGroupPacketPeriod(packet, input.period, bundle);
    if (input.exported !== undefined) {
      const imported = await this.machine.importExportedRoomKeys(
        input.exported,
        () => {},
      );
      imported.free();
    }
    const settings = new DecryptionSettings(TrustRequirement.Untrusted);
    try {
      const event = await this.machine.decryptRoomEvent(
        JSON.stringify({
          type: 'm.room.encrypted',
          event_id: `$${packet.id}`,
          sender: matrixUser(packet.sender),
          origin_server_ts: 0,
          content: packet.content,
        }),
        new RoomId(groupRoom(packet.groupId, packet.epoch)),
        settings,
      );
      try {
        if (
          event.senderCurve25519Key !== packet.content.sender_key ||
          event.senderClaimedEd25519Key !==
            packet.binding.public.keys[`ed25519:${packet.deviceId}`]
        )
          throw new Error('Group source key does not match.');
        return this.openGroupContent(packet, event.event);
      } finally {
        event.free();
      }
    } finally {
      settings.free();
    }
  }
  private openGroupContent(packet: GroupPacket, event: string): string {
    const payload = object(object(JSON.parse(event) as unknown)['content']),
      identity = object(payload['org.0xdmme.group']);
    this.assertGroupContentRelation(identity, packet);
    if (
      payload['msgtype'] !== messageType(packet.kind) ||
      typeof payload['body'] !== 'string' ||
      identity['id'] !== packet.id ||
      identity['sender'] !== packet.sender ||
      identity['groupId'] !== packet.groupId ||
      identity['epoch'] !== packet.epoch
    )
      throw new Error(
        'Group content does not match the authenticated package.',
      );
    if (
      packet.kind === 'attachment' &&
      canonical(
        contentRefs(attachmentContent(JSON.parse(payload['body']) as unknown)),
      ) !== canonical(packet.attachments)
    )
      throw new Error('Group attachment does not match.');
    return payload['body'];
  }
  private assertGroupContentRelation(
    identity: Record<string, unknown>,
    packet: GroupPacket,
  ): void {
    if (
      canonical(identity['relation'] ?? null) !==
      canonical(packet.relation ?? null)
    )
      throw new Error(
        'Group content does not match the authenticated package.',
      );
  }
  async decrypt(input: {
    packet: MessagePacket;
    senderEvent: DirectoryEvent;
    exported?: string;
  }): Promise<string> {
    return (await this.decryptContent(input)).text;
  }
  async decryptContent(input: {
    packet: MessagePacket;
    senderEvent: DirectoryEvent;
    exported?: string;
  }): Promise<MessagePresentation & { text: string }> {
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
          throw new Error('Source keys do not match.');
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
          throw new Error('Content does not match the authenticated message.');
        checkAttachmentPacket(packet, payload['body']);
        return {
          text: payload['body'],
          ...messagePresentation(identity['presentation']),
        };
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
    this.lastGroupKeys = null;
  }
}

function historyAccount(history: DirectoryEvent[]): string {
  const current = history.at(-1);
  if (!current) throw new Error('Member directory missing.');
  return current.accountId;
}
