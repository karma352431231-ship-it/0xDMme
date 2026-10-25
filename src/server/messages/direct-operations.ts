import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import { fingerprint, directoryEvent } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type {
  ContactAuthority,
  Database,
  DeviceStore,
} from '../database/index.ts';
import type { MessageAction } from './operation.ts';
import {
  messageSnapshot as snapshot,
  messageSequence as sequence,
} from './operation-input.ts';
import { digest } from '../../shared/devices/index.ts';
import { messagePacket, verifyPacket } from '../../shared/messages/index.ts';
import type { AttachmentService } from '../attachments/index.ts';
import { messageSyncOperations } from './sync.ts';
interface DirectMessagePorts {
  messages: Database['messages'];
  contacts: Pick<Database['contacts'], 'playbackAllowed' | 'directory'>;
  devices: Pick<DeviceStore, 'current'>;
  attachments: Pick<AttachmentService, 'clean'> | null;
}
/** Private-message window, publication and deletion contracts, including bounds. */
export function directMessageOperations(
  input: DirectMessagePorts,
): Record<string, MessageAction> {
  return {
    live: (a, d) => {
      keys(d, Object.hasOwn(d, 'categories') ? ['categories'] : []);
      if (
        Object.hasOwn(d, 'categories') &&
        typeof d['categories'] !== 'boolean'
      )
        throw new AccountError(400, 'Invalid live capability.');
      return Promise.resolve(a.directory);
    },
    'playback-allowed': (a, d) => {
      keys(d, ['peer']);
      return input.contacts.playbackAllowed(a, uuid(d['peer']));
    },
    publish: (a, d) => publishMessage(input, a, d),
    'profile-known': (a, d) => {
      keys(d, ['id', 'peer']);
      return input.messages.profileKnown(a, uuid(d['id']), uuid(d['peer']));
    },
    accepted: (a, d) => {
      keys(d, ['id', 'hash']);
      return input.messages.accepted(a, uuid(d['id']), fingerprint(d['hash']));
    },
    ...messageSyncOperations(input.messages),
    snapshot: (a, d) => {
      keys(d, []);
      return input.messages.snapshot(a);
    },
    changes: (a, d) => {
      keys(d, ['from', 'snapshot']);
      return input.messages.changes(a, {
        from: snapshot(d['from']),
        snapshot: snapshot(d['snapshot']),
      });
    },
    page: (a, d) => {
      keys(d, ['snapshot', 'after']);
      return input.messages.page(a, {
        snapshot: snapshot(d['snapshot']),
        after: sequence(d['after']),
      });
    },
    relations: (a, d) => {
      keys(d, ['ids', 'snapshot']);
      if (!Array.isArray(d['ids']) || d['ids'].length > 16)
        throw new AccountError(400, 'Invalid batch.');
      return input.messages.relations(
        a,
        d['ids'].map(uuid),
        snapshot(d['snapshot']),
      );
    },
    preview: (a, d) => {
      keys(d, ['peers', 'snapshot']);
      if (!Array.isArray(d['peers']) || d['peers'].length > 16)
        throw new AccountError(400, 'Invalid batch.');
      return input.messages.preview(a, {
        peers: [...new Set(d['peers'].map(uuid))],
        snapshot: snapshot(d['snapshot']),
      });
    },
    object: (a, d) => {
      keys(d, ['id', 'snapshot']);
      return input.messages.object(a, uuid(d['id']), snapshot(d['snapshot']));
    },
    confirm: (a, d) => {
      keys(d, ['snapshot']);
      return input.messages.confirmSnapshot(a, snapshot(d['snapshot']));
    },
    delivery: (a, d) => {
      keys(d, ['snapshot', 'ids']);
      if (!Array.isArray(d['ids']) || d['ids'].length > 18)
        throw new AccountError(400, 'Invalid batch.');
      return input.messages.delivery(a, {
        snapshot: snapshot(d['snapshot']),
        ids: d['ids'].map(uuid),
      });
    },
    acknowledge: (a, d) => {
      keys(d, ['id', 'hash']);
      return input.messages.acknowledge(
        a,
        uuid(d['id']),
        fingerprint(d['hash']),
      );
    },
    delete: async (a, d, p) => {
      keys(d, ['id', 'hash', 'revision']);
      integer(d['revision'], 128);
      await input.messages.remove(a, uuid(d['id']), fingerprint(d['hash']), p);
      await input.attachments?.clean();
      return { status: 'saved' };
    },
    'peer-directory': (a, d) => {
      keys(d, ['accountId', 'after']);
      return input.contacts.directory(
        a,
        uuid(d['accountId']),
        integer(d['after'], 128),
      );
    },
    history: (a, d) => {
      keys(d, ['accountId', 'after', 'through']);
      return input.messages.history(a, {
        accountId: uuid(d['accountId']),
        after: integer(d['after'], 128),
        through: integer(d['through'], 128),
      });
    },
  };
}
async function publishMessage(
  input: DirectMessagePorts,
  a: ContactAuthority,
  d: Record<string, unknown>,
): Promise<unknown> {
  keys(d, ['packet']);
  const packet = messagePacket(d['packet']),
    hash = await digest(JSON.stringify(packet));
  if (packet.socialMedia)
    throw new AccountError(400, 'Handle DM format outside this context.');
  if (await input.messages.accepted(a, packet.id, hash))
    return { status: 'accepted', hash };
  const current = await input.devices.current(a.session.accountId);
  if (!current) throw new AccountError(403, 'Directory missing.');
  await verifyPacket(packet, directoryEvent(current.event));
  return input.messages.admit(a, packet, hash);
}
