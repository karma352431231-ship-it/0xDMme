import { randomUUID } from 'node:crypto';
import {
  identity,
  maxBodyBytes,
  onlyKeys,
  parseObject,
  peer,
  record,
  roles,
  text,
} from '../../shared/crypto-probe/index.ts';
import type {
  JsonObject,
  Operation,
  Role,
} from '../../shared/crypto-probe/index.ts';
import { validateUpload } from './public-keys.ts';
import { parseEnvelope } from '../../shared/vault-probe/index.ts';

const limit = 32;
type Upload = ReturnType<typeof validateUpload>;

function encryptedContent(value: unknown): JsonObject {
  const content = record(value);
  onlyKeys(content, [
    'algorithm',
    'ciphertext',
    'device_id',
    'sender_key',
    'session_id',
  ]);
  if (content.algorithm !== 'm.megolm.v1.aes-sha2')
    throw new Error('Conteúdo não cifrado.');
  for (const key of ['ciphertext', 'device_id', 'sender_key', 'session_id'])
    text(content[key]);
  return content;
}

function encryptedToDevice(value: unknown): JsonObject {
  const content = record(value);
  onlyKeys(content, [
    'algorithm',
    'sender_key',
    'ciphertext',
    'org.matrix.msgid',
  ]);
  if (content.algorithm !== 'm.olm.v1.curve25519-aes-sha2')
    throw new Error('Chave não cifrada.');
  text(content.sender_key, 43);
  const ciphertext = record(content.ciphertext);
  if (Object.keys(ciphertext).length !== 1)
    throw new Error('Destinatário inválido.');
  const packet = record(Object.values(ciphertext)[0]);
  onlyKeys(packet, ['type', 'body']);
  if (packet.type !== 0 && packet.type !== 1)
    throw new Error('Pacote inválido.');
  text(packet.body);
  return content;
}

/** Relay de laboratório, em memória: nenhuma garantia de aceitação durável. */
export class ProbeRelay {
  #uploads = new Map<Role, Upload>();
  #toDevice = new Map<Role, JsonObject[]>(roles.map((role) => [role, []]));
  #events: JsonObject[] = [];
  #vaults = new Map<Role, string>();
  #vaultWrites = new Map<Role, number>();

  dispatch(role: Role, operation: Operation, serialized: string): string {
    if (Buffer.byteLength(serialized) > maxBodyBytes)
      throw new Error('Limite de entrada excedido.');
    const body = parseObject(serialized);
    switch (operation) {
      case 'upload':
        return JSON.stringify(this.#upload(role, body));
      case 'query':
        return JSON.stringify(this.#query());
      case 'claim':
        return JSON.stringify(this.#claim(role));
      case 'to-device':
        return JSON.stringify(this.#sendKey(role, body));
      case 'publish':
        return JSON.stringify(this.#publish(role, body));
      case 'poll':
        return JSON.stringify({
          to_device: this.#toDevice.get(role),
          events: this.#events,
        });
      case 'vault-save':
        return this.#saveVault(role, serialized);
      case 'vault-load':
        return this.#loadVault(role);
    }
  }

  #loadVault(role: Role): string {
    return this.#vaults.get(role) ?? '{}';
  }

  inspect(): string {
    return JSON.stringify({
      public_keys: [...this.#uploads.values()],
      to_device: [...this.#toDevice.values()],
      events: this.#events,
      vaults: [...this.#vaults.values()],
    });
  }

  #saveVault(role: Role, serialized: string): string {
    const envelope = parseEnvelope(serialized);
    if (envelope.owner !== identity(role).user)
      throw new Error('Identidade de cofre inválida.');
    const previous = this.#vaults.get(role);
    if (previous && envelope.revision <= parseEnvelope(previous).revision)
      throw new Error('Revisão de cofre desatualizada.');
    const count = this.#vaultWrites.get(role) ?? 0;
    if (count >= limit)
      throw new Error('Limite de snapshots do ensaio atingido.');
    this.#vaults.set(role, JSON.stringify(envelope));
    this.#vaultWrites.set(role, count + 1);
    return '{}';
  }

  #upload(role: Role, body: JsonObject): JsonObject {
    const upload = validateUpload(body, role);
    if (this.#uploads.has(role))
      throw new Error(
        'Este cliente já está registrado. Reinicie o laboratório.',
      );
    this.#uploads.set(role, upload);
    return {
      one_time_key_counts: {
        signed_curve25519: Object.keys(upload.oneTime).length,
      },
    };
  }

  #query(): JsonObject {
    const deviceKeys = Object.fromEntries(
      [...this.#uploads].map(([role, upload]) => [
        identity(role).user,
        { [identity(role).device]: upload.device },
      ]),
    );
    return { device_keys: deviceKeys, failures: {} };
  }

  #claim(role: Role): JsonObject {
    const recipient = peer(role);
    const upload = this.#uploads.get(recipient);
    if (!upload) throw new Error('O outro cliente ainda não foi iniciado.');
    const entry = Object.entries(upload.oneTime)[0];
    if (!entry) throw new Error('Não há chave disponível.');
    delete upload.oneTime[entry[0]];
    const id = identity(recipient);
    return {
      one_time_keys: { [id.user]: { [id.device]: { [entry[0]]: entry[1] } } },
      failures: {},
    };
  }

  #sendKey(role: Role, body: JsonObject): JsonObject {
    onlyKeys(body, ['messages']);
    const recipient = peer(role);
    const id = identity(recipient);
    const messages = record(body.messages);
    onlyKeys(messages, [id.user]);
    const devices = record(messages[id.user]);
    onlyKeys(devices, [id.device]);
    const content = encryptedToDevice(devices[id.device]);
    const queue = this.#toDevice.get(recipient);
    if (!queue || queue.length >= limit)
      throw new Error('Fila do laboratório cheia.');
    queue.push({
      sender: identity(role).user,
      type: 'm.room.encrypted',
      content,
    });
    return {};
  }

  #publish(role: Role, body: JsonObject): JsonObject {
    const content = encryptedContent(body);
    if (content.device_id !== identity(role).device)
      throw new Error('Dispositivo inválido.');
    if (this.#events.length >= limit)
      throw new Error('Limite do laboratório atingido.');
    const event = {
      type: 'm.room.encrypted',
      sender: identity(role).user,
      content,
      event_id: `$${randomUUID()}`,
      origin_server_ts: Date.now(),
    };
    this.#events.push(event);
    return event;
  }
}
