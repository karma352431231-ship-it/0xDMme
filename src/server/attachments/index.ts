import { createHash } from 'node:crypto';
import {
  AccountError,
  base64,
  encode,
  keys,
  uuid,
} from '../../shared/account/index.ts';
import {
  attachmentRefs,
  partLimit,
  verifyAttachmentPart,
} from '../../shared/attachments/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type {
  AttachmentStore,
  ContactAuthority,
  MessageStore,
  MessageSnapshot,
} from '../database/index.ts';
import type { ObjectStore } from '../object-store/index.ts';
function writeRequest(
  operation: string,
  d: Record<string, unknown>,
): { id: string; index: number | null; bytes: Uint8Array | null } {
  const finishing = operation === 'attachment-finish';
  keys(d, finishing ? ['id'] : ['id', 'index', 'ciphertext']);
  return {
    id: uuid(d['id']),
    index: finishing ? null : integer(d['index'], 11),
    bytes: finishing ? null : base64(d['ciphertext'], partLimit),
  };
}
export class AttachmentService {
  private readonly store: AttachmentStore;
  private readonly messages: MessageStore;
  private readonly objects: ObjectStore;
  private active = 0;
  private cleaning: Promise<void> | null = null;
  constructor(
    store: AttachmentStore,
    messages: MessageStore,
    objects: ObjectStore,
  ) {
    this.store = store;
    this.messages = messages;
    this.objects = objects;
  }
  async clean(): Promise<void> {
    if (this.cleaning) return this.cleaning;
    this.cleaning = this.collect();
    try {
      await this.cleaning;
    } finally {
      this.cleaning = null;
    }
  }
  private async collect(): Promise<void> {
    for (const row of await this.store.garbage()) {
      await this.objects.discardAttachment(row.id);
      await this.store.collected(row.id);
    }
  }
  async operate(
    a: ContactAuthority,
    operation: string,
    d: Record<string, unknown>,
    snapshot?: MessageSnapshot,
  ): Promise<unknown> {
    if (this.active >= 4)
      throw new AccountError(429, 'Transferências ocupadas. Retome depois.');
    this.active++;
    try {
      return await this.execute(a, operation, d, snapshot);
    } finally {
      this.active--;
    }
  }
  private async execute(
    a: ContactAuthority,
    operation: string,
    d: Record<string, unknown>,
    snapshot?: MessageSnapshot,
  ): Promise<unknown> {
    if (operation === 'attachment-reserve') {
      keys(d, ['message', 'peer', 'refs']);
      await this.clean();
      return this.store.reserve(a, {
        message: uuid(d['message']),
        peer: uuid(d['peer']),
        refs: attachmentRefs(d['refs']),
      });
    }
    if (operation === 'attachment-cancel') {
      keys(d, ['message']);
      await this.store.cancel(a, uuid(d['message']));
      await this.clean();
      return { status: 'cancelled' };
    }
    if (operation === 'attachment-get') {
      if (!snapshot)
        throw new AccountError(400, 'Estado de mensagens ausente.');
      return this.read(a, d, snapshot);
    }
    return this.write(a, operation, d);
  }
  private async write(
    a: ContactAuthority,
    operation: string,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    const { id, index, bytes } = writeRequest(operation, d),
      lease = await this.store.begin(a, id, index);
    const status = index === null ? 'ready' : 'stored';
    try {
      await verifyAttachmentPart(lease.ref, index, bytes);
    } catch (error: unknown) {
      if (lease.writer) await this.store.release(id, lease.writer);
      throw error;
    }
    if (!lease.writer) return { status };
    try {
      const objects = await this.objects.attachment(id);
      if (bytes) await objects.put(bytes);
      else {
        const digest = createHash('sha256');
        for (const part of lease.ref.parts)
          digest.update(await objects.read(part.hash));
        if (digest.digest('hex') !== lease.ref.hash)
          throw new AccountError(400, 'Anexo integral divergente.');
      }
      await this.store.finish(a, { id, writer: lease.writer, index });
    } catch (error: unknown) {
      await this.store.release(id, lease.writer);
      throw error;
    }
    return { status };
  }
  private async read(
    a: ContactAuthority,
    d: Record<string, unknown>,
    snapshot: MessageSnapshot,
  ): Promise<unknown> {
    keys(d, ['message', 'id', 'index', 'snapshot']);
    const input = {
      message: uuid(d['message']),
      id: uuid(d['id']),
      index: integer(d['index'], 11),
    };
    await this.messages.confirmSnapshot(a, snapshot);
    const ref = await this.store.readable(a, input),
      part = ref.parts[input.index];
    if (!part) throw new AccountError(400, 'Parte inexistente.');
    const bytes = await (
      await this.objects.readAttachment(input.id)
    ).read(part.hash);
    await this.store.readable(a, input);
    await this.messages.confirmSnapshot(a, snapshot);
    return { ciphertext: encode(bytes) };
  }
}
