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
      throw new Error('Dispositivo revogado nesta sessão.');
    this.#peerKeys = undefined;
    const id = identity(peer(this.#role));
    await this.#machine.updateTrackedUsers([new UserId(id.user)]);
    await this.#flush();
    const device = await this.#machine.getDevice(
      new UserId(id.user),
      new DeviceId(id.device),
    );
    if (!device)
      throw new Error('O outro cliente ainda não publicou sua chave.');
    try {
      if (device.ed25519Key?.toBase64() !== expectedFingerprint.trim()) {
        throw new Error('A chave do outro cliente não confere.');
      }
      await device.setLocalTrust(LocalTrust.Verified);
      const curve = device.curve25519Key?.toBase64();
      if (!curve) throw new Error('Chave de criptografia ausente.');
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
      throw new Error('Rotação pendente: envio bloqueado.');
    if (!this.#peerKeys && !this.#revoked)
      throw new Error('Confirme a chave do outro cliente antes de enviar.');
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
      throw new Error('Nenhum dispositivo autorizado.');
    this.#rotationPending = true;
    this.#peerKeys = undefined;
    const id = identity(peer(this.#role));
    const device = await this.#machine.getDevice(
      new UserId(id.user),
      new DeviceId(id.device),
    );
    if (!device)
      throw new Error('Dispositivo ausente: envio permanece bloqueado.');
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
      throw new Error('Confirme a chave do outro cliente antes de receber.');
    const response = parseObject(await this.#transport('poll', '{}'));
    if (
      !Array.isArray(response.to_device) ||
      !Array.isArray(response.events) ||
      response.to_device.length > 32 ||
      response.events.length > 32
    ) {
      throw new Error('Resposta inválida.');
    }
    const newKeys = response.to_device.filter(
      (value: unknown) => !this.#seenKeys.has(JSON.stringify(value)),
    );
    if (this.#seenKeys.size + newKeys.length > 32)
      throw new Error('Limite de pacotes de chave do ensaio.');
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
        throw new Error('Pacote de chave não autorizado ou inválido.');
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
      throw new Error('Remetente não autorizado.');
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
          throw new Error('Chave de origem não autorizada.');
        }
        const content = record(parseObject(decrypted.event).content);
        if (content.msgtype !== 'm.text')
          throw new Error('Tipo de mensagem inválido.');
        return this.#acceptMessage(content, text(event.event_id, 100));
      } finally {
        decrypted.free();
      }
    } catch (error: unknown) {
      // Causa permanece no cliente; a UI mostra apenas a mensagem fixa e não a registra.
      throw new Error(
        'Mensagem rejeitada: chave, autoria ou integridade inválida.',
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
        throw new Error('Repetição ou conflito de mensagem.');
      return previous.body;
    }
    if (this.#eventIds.has(eventId) || this.#seenMessages.size >= 32)
      throw new Error('Conflito ou limite de mensagens do ensaio.');
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
        else throw new Error('Operação fora do primeiro protótipo.');
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
