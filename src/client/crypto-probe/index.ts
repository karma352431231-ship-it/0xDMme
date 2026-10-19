import {
  CollectStrategy,
  DecryptionSettings,
  DeviceId,
  DeviceLists,
  EncryptionSettings,
  initAsync,
  KeysQueryRequest,
  KeysUploadRequest,
  LocalTrust,
  OlmMachine,
  ProcessedToDeviceEventType,
  RoomId,
  TrustRequirement,
  UserId,
} from '@matrix-org/matrix-sdk-crypto-wasm';
import {
  identity,
  parseObject,
  peer,
  record,
  room,
  text,
} from '../../shared/crypto-probe/index.ts';
import type {
  JsonObject,
  ProbeTransport,
  Role,
} from '../../shared/crypto-probe/index.ts';

export class ProbeClient {
  #machine: OlmMachine;
  #role: Role;
  #transport: ProbeTransport;
  #peerKeys: { signing: string; curve: string } | undefined;
  #seenKeys = new Set<string>();
  #revoked = false;
  #rotationPending = false;
  #pending: Promise<unknown> = Promise.resolve();
  #seenMessages = new Map<string, { eventId: string; body: string }>();
  #eventIds = new Set<string>();

  private constructor(
    machine: OlmMachine,
    role: Role,
    transport: ProbeTransport,
  ) {
    this.#machine = machine;
    this.#role = role;
    this.#transport = transport;
    machine.roomKeyRequestsEnabled = false;
    machine.roomKeyForwardingEnabled = false;
  }

  static async create(
    role: Role,
    transport: ProbeTransport,
  ): Promise<ProbeClient> {
    await initAsync();
    const id = identity(role);
    const machine = await OlmMachine.initialize(
      new UserId(id.user),
      new DeviceId(id.device),
    );
    return new ProbeClient(machine, role, transport);
  }

  get fingerprint(): string {
    return this.#machine.identityKeys.ed25519.toBase64();
  }

  async publishKeys(): Promise<void> {
    await this.#flush();
  }

  confirmPeer(expectedFingerprint: string): Promise<void> {
    return this.#exclusive(() => this.#confirmPeer(expectedFingerprint));
  }

  async #confirmPeer(expectedFingerprint: string): Promise<void> {
    if (this.#revoked || this.#rotationPending)
      throw new Error('Device revoked in this session.');
    this.#peerKeys = undefined;
    const id = identity(peer(this.#role));
    await this.#machine.updateTrackedUsers([new UserId(id.user)]);
    await this.#flush();
    const device = await this.#machine.getDevice(
      new UserId(id.user),
      new DeviceId(id.device),
    );
    if (!device)
      throw new Error('The other client has not published its key yet.');
    try {
      if (device.ed25519Key?.toBase64() !== expectedFingerprint.trim()) {
        throw new Error("The other client's key does not match.");
      }
      await device.setLocalTrust(LocalTrust.Verified);
      const curve = device.curve25519Key?.toBase64();
      if (!curve) throw new Error('Encryption key missing.');
      this.#peerKeys = { signing: expectedFingerprint.trim(), curve };
    } finally {
      device.free();
    }
  }

  send(message: string): Promise<JsonObject> {
    return this.#exclusive(() => this.#send(message));
  }

  async #send(message: string): Promise<JsonObject> {
    if (this.#rotationPending)
      throw new Error('Rotation pending: sending blocked.');
    if (!this.#peerKeys && !this.#revoked)
      throw new Error("Confirm the other client's key before sending.");
    text(message, 1_000);
    const users = () =>
      this.#revoked ? [] : [new UserId(identity(peer(this.#role)).user)];
    const claim = await this.#machine.getMissingSessions(users());
    if (claim) {
      try {
        const response = await this.#transport('claim', claim.body);
        await this.#machine.markRequestAsSent(claim.id, claim.type, response);
      } finally {
        claim.free();
      }
    }
    const settings = new EncryptionSettings();
    settings.sharingStrategy = CollectStrategy.onlyTrustedDevices();
    try {
      for (const request of await this.#machine.shareRoomKey(
        new RoomId(room),
        users(),
        settings,
      )) {
        try {
          const response = await this.#transport('to-device', request.body);
          await this.#machine.markRequestAsSent(
            request.id,
            request.type,
            response,
          );
        } finally {
          request.free();
        }
      }
    } finally {
      settings.free();
    }
    const content = await this.#machine.encryptRoomEvent(
      new RoomId(room),
      'm.room.message',
      JSON.stringify({
        msgtype: 'm.text',
        body: message,
        'org.hash-talk.probe.id': crypto.randomUUID(),
      }),
    );
    return parseObject(await this.#transport('publish', content));
  }

  /** Revogação local de laboratório: bloquear compartilhamento e invalidar a sessão de grupo. */
  revokePeer(): Promise<void> {
    return this.#exclusive(() => this.#revokePeer());
  }

  async #revokePeer(): Promise<void> {
    if (!this.#peerKeys && !this.#rotationPending)
      throw new Error('No authorized devices.');
    this.#rotationPending = true;
    this.#peerKeys = undefined;
    const id = identity(peer(this.#role));
    const device = await this.#machine.getDevice(
      new UserId(id.user),
      new DeviceId(id.device),
    );
    if (!device) throw new Error('Device missing: sending remains blocked.');
    try {
      await device.setLocalTrust(LocalTrust.BlackListed);
    } finally {
      device.free();
    }
    await this.#machine.invalidateGroupSession(new RoomId(room));
    this.#revoked = true;
    this.#rotationPending = false;
  }

  receive(): Promise<JsonObject[]> {
    return this.#exclusive(() => this.#receive());
  }

  async #receive(): Promise<JsonObject[]> {
    if (!this.#peerKeys)
      throw new Error("Confirm the other client's key before receiving.");
    const response = parseObject(await this.#transport('poll', '{}'));
    if (
      !Array.isArray(response.to_device) ||
      !Array.isArray(response.events) ||
      response.to_device.length > 32 ||
      response.events.length > 32
    ) {
      throw new Error('Invalid response.');
    }
    const newKeys = response.to_device.filter(
      (value: unknown) => !this.#seenKeys.has(JSON.stringify(value)),
    );
    if (this.#seenKeys.size + newKeys.length > 32)
      throw new Error('Test key package limit reached.');
    const processed = await this.#machine.receiveSyncChanges(
      JSON.stringify(newKeys),
      new DeviceLists(),
      new Map([['signed_curve25519', 50]]),
    );
    try {
      if (
        processed.some(
          (event) => event.type !== ProcessedToDeviceEventType.Decrypted,
        )
      ) {
        throw new Error('Key package unauthorized or invalid.');
      }
    } finally {
      for (const event of processed) event.free();
    }
    for (const value of newKeys) this.#seenKeys.add(JSON.stringify(value));
    return response.events.map((value: unknown) => record(value));
  }

  decrypt(event: JsonObject): Promise<string> {
    return this.#exclusive(() => this.#decrypt(event));
  }

  async #decrypt(event: JsonObject): Promise<string> {
    const pinned = this.#peerKeys;
    if (!pinned || event.sender !== identity(peer(this.#role)).user) {
      throw new Error('Sender not authorized.');
    }
    // Este ensaio usa comparação manual de chaves, não identidade cross-signed.
    // A autenticação é obrigatória pelos dois pins abaixo, sem fallback após erro.
    const settings = new DecryptionSettings(TrustRequirement.Untrusted);
    try {
      const decrypted = await this.#machine.decryptRoomEvent(
        JSON.stringify(event),
        new RoomId(room),
        settings,
      );
      try {
        if (
          decrypted.senderCurve25519Key !== pinned.curve ||
          decrypted.senderClaimedEd25519Key !== pinned.signing
        ) {
          throw new Error('Source key not authorized.');
        }
        const content = record(parseObject(decrypted.event).content);
        if (content.msgtype !== 'm.text')
          throw new Error('Invalid message type.');
        return this.#acceptMessage(content, text(event.event_id, 100));
      } finally {
        decrypted.free();
      }
    } catch (error: unknown) {
      // Causa permanece no cliente; a UI mostra apenas a mensagem fixa e não a registra.
      throw new Error(
        'Message rejected: invalid key, authorship or integrity.',
        { cause: error },
      );
    } finally {
      settings.free();
    }
  }

  #acceptMessage(content: JsonObject, eventId: string): string {
    const id = text(content['org.hash-talk.probe.id'], 100);
    const body = text(content.body, 1_000);
    const previous = this.#seenMessages.get(id);
    if (previous) {
      if (previous.eventId !== eventId || previous.body !== body)
        throw new Error('Duplicate or conflicting message.');
      return previous.body;
    }
    if (this.#eventIds.has(eventId) || this.#seenMessages.size >= 32)
      throw new Error('Conflict or test message limit reached.');
    this.#seenMessages.set(id, { eventId, body });
    this.#eventIds.add(eventId);
    return body;
  }

  close(): void {
    this.#machine.close();
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.#pending.then(operation);
    // A falha chega ao chamador; somente a fila interna precisa poder prosseguir.
    this.#pending = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async #flush(): Promise<void> {
    for (const request of await this.#machine.outgoingRequests()) {
      try {
        let operation: 'upload' | 'query';
        if (request instanceof KeysUploadRequest) operation = 'upload';
        else if (request instanceof KeysQueryRequest) operation = 'query';
        else throw new Error('Operation outside the first prototype.');
        const response = await this.#transport(operation, request.body);
        await this.#machine.markRequestAsSent(
          request.id,
          request.type,
          response,
        );
      } finally {
        request.free();
      }
    }
  }
}
