import { createHash } from 'node:crypto';
import {
  AccountError,
  base64,
  encode,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import {
  attachmentRefs,
  partLimit,
  verifyAttachmentPart,
} from '../../shared/attachments/index.ts';
import type { AttachmentRef } from '../../shared/attachments/index.ts';
import { statusPacket, statusEnvelopes } from '../../shared/status/index.ts';
import type {
  ContactAuthority,
  StatusStore,
  StatusMediaStore,
} from '../database/index.ts';
import type { ObjectStore } from '../object-store/index.ts';
import { StatusSignals } from './signals.ts';
export const statusOperations = [
  'status-begin',
  'status-contacts',
  'status-recipient-directory',
  'status-recipients',
  'status-ready',
  'status-publish',
  'status-list',
  'status-read',
  'status-origin',
  'status-remove',
  'status-attachment-reserve',
  'status-attachment-part',
  'status-attachment-finish',
  'status-attachment-get',
] as const;
interface WriteInput {
  statusId: string;
  id: string;
  index: number | null;
}
function writeRequest(
  d: Record<string, unknown>,
  finishing: boolean,
): { input: WriteInput; bytes: Uint8Array | null } {
  keys(
    d,
    finishing ? ['statusId', 'id'] : ['statusId', 'id', 'index', 'ciphertext'],
  );
  return {
    input: {
      statusId: uuid(d['statusId']),
      id: uuid(d['id']),
      index: finishing ? null : integer(d['index'], 11),
    },
    bytes: finishing ? null : base64(d['ciphertext'], partLimit),
  };
}
function directoryRequests(
  input: unknown,
): { accountId: string; after: number }[] {
  if (!Array.isArray(input) || !input.length || input.length > 16)
    throw new AccountError(400, 'Página de destinatários inválida.');
  const requests = input.map((raw: unknown) => {
    const d = object(raw);
    keys(d, ['accountId', 'after']);
    return { accountId: uuid(d['accountId']), after: integer(d['after'], 128) };
  });
  if (new Set(requests.map((r) => r.accountId)).size !== requests.length)
    throw new AccountError(400, 'Destinatário repetido.');
  return requests;
}
function nullableUuid(value: unknown): string | null {
  return value === null ? null : uuid(value);
}
export class StatusService {
  private readonly posts: StatusStore;
  private readonly media: StatusMediaStore;
  private readonly objects: ObjectStore;
  private readonly signals: StatusSignals;
  private active = 0;
  private cleaning: Promise<void> | null = null;
  private readonly actions: Record<
    string,
    (a: ContactAuthority, d: Record<string, unknown>) => Promise<unknown>
  >;
  constructor(
    posts: StatusStore,
    media: StatusMediaStore,
    objects: ObjectStore,
  ) {
    this.posts = posts;
    this.media = media;
    this.objects = objects;
    this.signals = new StatusSignals(posts);
    this.actions = {
      'status-begin': async (a, d) => {
        keys(d, ['id']);
        await this.clean();
        return posts.begin(a, uuid(d['id']));
      },
      'status-contacts': (a, d) => {
        keys(d, ['id', 'after']);
        return posts.contactsPage(a, {
          id: uuid(d['id']),
          after: nullableUuid(d['after']),
        });
      },
      'status-recipient-directory': (a, d) => {
        keys(d, ['id', 'accounts']);
        return posts.recipientDirectory(a, {
          id: uuid(d['id']),
          accounts: directoryRequests(d['accounts']),
        });
      },
      'status-recipients': (a, d) => {
        keys(d, ['id', 'page', 'previous', 'envelopes']);
        return posts.append(a, {
          id: uuid(d['id']),
          page: integer(d['page'], Number.MAX_SAFE_INTEGER),
          previous: d['previous'] === null ? null : fingerprint(d['previous']),
          envelopes: statusEnvelopes(d['envelopes']),
        });
      },
      'status-ready': (a, d) => {
        keys(d, ['id']);
        return posts.ready(a, uuid(d['id']));
      },
      'status-publish': (a, d) => this.publish(a, d),
      'status-list': (a, d) => {
        keys(d, ['after']);
        return posts.list(a, nullableUuid(d['after']));
      },
      'status-read': (a, d) => {
        keys(d, ['id']);
        return posts.read(a, uuid(d['id']));
      },
      'status-origin': (a, d) => {
        keys(d, ['id', 'after']);
        return posts.origin(a, {
          id: uuid(d['id']),
          after: integer(d['after'], 128),
        });
      },
      'status-remove': async (a, d) => {
        keys(d, ['id']);
        await posts.remove(a, uuid(d['id']));
        this.signals.request();
        await this.clean();
        return { status: 'removed' };
      },
      'status-attachment-reserve': (a, d) => {
        keys(d, ['statusId', 'refs']);
        return media.reserve(a, {
          statusId: uuid(d['statusId']),
          refs: attachmentRefs(d['refs']),
        });
      },
      'status-attachment-part': (a, d) => this.write(a, d, false),
      'status-attachment-finish': (a, d) => this.write(a, d, true),
      'status-attachment-get': (a, d) => this.read(a, d),
    };
  }
  async operate(
    a: ContactAuthority,
    operation: string,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    const action = Object.hasOwn(this.actions, operation)
      ? this.actions[operation]
      : undefined;
    if (!action)
      throw new AccountError(404, 'Operação de status indisponível.');
    if (this.active >= 4)
      throw new AccountError(429, 'Transferências ocupadas. Retome depois.');
    this.active++;
    try {
      return await action(a, d);
    } finally {
      this.active--;
    }
  }
  private async publish(
    a: ContactAuthority,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    keys(d, ['packet']);
    const packet = statusPacket(d['packet']);
    const result = await this.posts.publish(a, packet, (client, p) =>
      this.media.admit(client, p),
    );
    this.signals.request();
    return result;
  }
  async clean(): Promise<void> {
    this.signals.request();
    if (this.cleaning) return this.cleaning;
    this.cleaning = this.collect();
    try {
      await this.cleaning;
    } finally {
      this.cleaning = null;
    }
  }
  private async collect(): Promise<void> {
    const retired = await this.posts.garbage();
    for (const row of await this.media.garbage()) {
      await this.objects.discardStatusMedia(row.status_id, row.id);
      await this.media.collected(row.id);
    }
    for (const row of retired) {
      if (await this.media.hasMedia(row.id)) continue;
      await this.objects.discardEmptyMediaScope('status', row.id);
      await this.posts.collected(row.id);
    }
  }
  async close(): Promise<void> {
    await this.signals.close();
    await this.cleaning;
  }
  private async write(
    a: ContactAuthority,
    d: Record<string, unknown>,
    finishing: boolean,
  ): Promise<unknown> {
    const { input, bytes } = writeRequest(d, finishing),
      lease = await this.media.begin(a, input);
    try {
      await verifyAttachmentPart(lease.ref, input.index, bytes);
      if (lease.writer)
        await this.preserve(
          a,
          { ...input, writer: lease.writer },
          { ref: lease.ref, bytes },
        );
    } catch (error: unknown) {
      if (lease.writer) await this.media.release(input.id, lease.writer);
      throw error;
    }
    return { status: finishing ? 'ready' : 'stored' };
  }
  private async preserve(
    a: ContactAuthority,
    input: WriteInput & { writer: string },
    data: { ref: AttachmentRef; bytes: Uint8Array | null },
  ): Promise<void> {
    const media = await (
      await this.objects.statusMedia(input.statusId)
    ).attachment(input.id);
    if (data.bytes) await media.put(data.bytes);
    else {
      const digest = createHash('sha256');
      for (const part of data.ref.parts)
        digest.update(await media.read(part.hash));
      if (digest.digest('hex') !== data.ref.hash)
        throw new AccountError(400, 'Foto integral divergente.');
    }
    await this.media.finish(a, input);
  }
  private async read(
    a: ContactAuthority,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    keys(d, ['statusId', 'id', 'index']);
    const input = {
      statusId: uuid(d['statusId']),
      id: uuid(d['id']),
      index: integer(d['index'], 11),
    };
    const ref = await this.media.readable(a, input),
      part = ref.parts[input.index];
    if (!part) throw new AccountError(400, 'Parte inexistente.');
    const bytes = await (
      await (
        await this.objects.readStatusMedia(input.statusId)
      ).readAttachment(input.id)
    ).read(part.hash);
    await this.media.readable(a, input);
    return { ciphertext: encode(bytes) };
  }
}
