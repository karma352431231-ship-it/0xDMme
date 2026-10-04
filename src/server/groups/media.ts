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
import type { AttachmentRef } from '../../shared/attachments/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type {
  ContactAuthority,
  GroupMediaStore,
  GroupRetentionStore,
  GroupScope,
} from '../database/index.ts';
import type { ObjectStore } from '../object-store/index.ts';
const operations = [
  'group-attachment-reserve',
  'group-attachment-part',
  'group-attachment-finish',
  'group-attachment-get',
  'group-attachment-cancel',
  'group-media-usage',
  'group-cleanup-notice',
  'group-vault-clear',
] as const;
function scope(data: Record<string, unknown>): GroupScope {
  return { groupId: uuid(data['groupId']), head: fingerprint(data['head']) };
}
function writeRequest(
  d: Record<string, unknown>,
  finishing: boolean,
): {
  input: GroupScope & { id: string; index: number | null };
  bytes: Uint8Array | null;
} {
  keys(
    d,
    finishing
      ? ['groupId', 'head', 'id']
      : ['groupId', 'head', 'id', 'index', 'ciphertext'],
  );
  return {
    input: {
      ...scope(d),
      id: uuid(d['id']),
      index: finishing ? null : integer(d['index'], 11),
    },
    bytes: finishing ? null : base64(d['ciphertext'], partLimit),
  };
}
export const groupMediaOperations = operations;
export class GroupMediaService {
  private readonly store: GroupMediaStore;
  private readonly retention: GroupRetentionStore;
  private readonly objects: ObjectStore;
  private active = 0;
  private cleaning: Promise<void> | null = null;
  private readonly actions: Record<
    string,
    (a: ContactAuthority, d: Record<string, unknown>) => Promise<unknown>
  >;
  constructor(
    store: GroupMediaStore,
    retention: GroupRetentionStore,
    objects: ObjectStore,
  ) {
    this.store = store;
    this.retention = retention;
    this.objects = objects;
    this.actions = {
      'group-attachment-reserve': async (a, d) => {
        keys(d, ['groupId', 'head', 'message', 'refs']);
        await this.clean();
        return store.reserve(a, {
          ...scope(d),
          message: uuid(d['message']),
          refs: attachmentRefs(d['refs']),
        });
      },
      'group-attachment-cancel': async (a, d) => {
        keys(d, ['groupId', 'head', 'message']);
        await store.cancel(a, { ...scope(d), message: uuid(d['message']) });
        await this.clean();
        return { status: 'cancelled' };
      },
      'group-attachment-get': (a, d) => this.read(a, d),
      'group-attachment-part': (a, d) => this.write(a, d, false),
      'group-attachment-finish': (a, d) => this.write(a, d, true),
      'group-media-usage': (a, d) => {
        keys(d, ['groupId', 'head']);
        return store.usage(a, scope(d));
      },
      'group-cleanup-notice': (a, d) => {
        keys(d, ['groupId', 'head', 'after']);
        return retention.notice(a, {
          ...scope(d),
          after: integer(d['after'], Number.MAX_SAFE_INTEGER),
        });
      },
      'group-vault-clear': async (a, d) => {
        keys(d, ['groupId', 'head']);
        await retention.clear(a, scope(d));
        await this.clean();
        return { status: 'clearing' };
      },
    };
  }
  async operate(
    a: ContactAuthority,
    operation: string,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    if (this.active >= 4)
      throw new AccountError(429, 'Transferências ocupadas. Retome depois.');
    const action = Object.hasOwn(this.actions, operation)
      ? this.actions[operation]
      : undefined;
    if (!action) throw new AccountError(404, 'Operação de mídia indisponível.');
    this.active++;
    try {
      return await action(a, d);
    } finally {
      this.active--;
    }
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
    await this.retention.tick();
    for (const row of await this.store.garbage()) {
      await this.objects.discardGroupMedia(row.group_id, row.id);
      await this.store.collected(row.id);
    }
    for (const row of await this.retention.retiredScopes()) {
      await this.objects.discardEmptyMediaScope('group', row.id);
      await this.retention.collectedScope(row.id);
    }
  }
  private async write(
    a: ContactAuthority,
    d: Record<string, unknown>,
    finishing: boolean,
  ): Promise<unknown> {
    const { input, bytes } = writeRequest(d, finishing);
    const lease = await this.store.begin(a, input);
    try {
      await verifyAttachmentPart(lease.ref, input.index, bytes);
      if (lease.writer)
        await this.preserve(
          a,
          { ...input, writer: lease.writer },
          { ref: lease.ref, bytes },
        );
    } catch (error: unknown) {
      if (lease.writer) await this.store.release(input.id, lease.writer);
      throw error;
    }
    return { status: finishing ? 'ready' : 'stored' };
  }
  private async preserve(
    a: ContactAuthority,
    input: GroupScope & { id: string; index: number | null; writer: string },
    data: { ref: AttachmentRef; bytes: Uint8Array | null },
  ): Promise<void> {
    const media = await (
      await this.objects.groupMedia(input.groupId)
    ).attachment(input.id);
    if (data.bytes) await media.put(data.bytes);
    else {
      const digest = createHash('sha256');
      for (const part of data.ref.parts)
        digest.update(await media.read(part.hash));
      if (digest.digest('hex') !== data.ref.hash)
        throw new AccountError(400, 'Mídia integral divergente.');
    }
    await this.store.finish(a, input);
  }
  private async read(
    a: ContactAuthority,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    keys(d, ['groupId', 'head', 'message', 'id', 'index']);
    const input = {
      ...scope(d),
      message: uuid(d['message']),
      id: uuid(d['id']),
      index: integer(d['index'], 11),
    };
    const ref = await this.store.readable(a, input),
      part = ref.parts[input.index];
    if (!part) throw new AccountError(400, 'Parte inexistente.');
    const bytes = await (
      await (
        await this.objects.readGroupMedia(input.groupId)
      ).readAttachment(input.id)
    ).read(part.hash);
    await this.store.readable(a, input);
    return { ciphertext: encode(bytes) };
  }
}
