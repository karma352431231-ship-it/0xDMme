import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import {
  publicStickerFile,
  publicStickerIds,
  publicStickerLimits,
  stickerPackName,
} from '../../shared/stickers/index.ts';
import type {
  ContactAuthority,
  PublicProfileStore,
} from '../database/index.ts';

/** Signed public sticker and pack commands (24/11/2026). */
export const stickerOperations = [
  'sticker-upload',
  'sticker-list',
  'sticker-remove',
  'sticker-pack-save',
  'sticker-pack-remove',
  'sticker-pack-add',
  'sticker-pack-panel',
  'sticker-pack-browse',
  'sticker-pack-read',
  'sticker-pack-containing',
] as const;

/** Validate a signed sticker command before calling the owning store. */
export function stickerOperation(
  store: Pick<PublicProfileStore, 'stickers' | 'stickerPacks'>,
  input: {
    operation: string;
    authority: ContactAuthority;
    data: Record<string, unknown>;
  },
) {
  const { operation, authority, data } = input;
  if (operation === 'sticker-upload') {
    keys(data, ['file']);
    return store.stickers.upload(authority, publicStickerFile(data['file']));
  }
  if (operation === 'sticker-list') {
    keys(data, []);
    return store.stickers.mine(authority);
  }
  if (operation === 'sticker-remove') {
    keys(data, ['id']);
    return store.stickers.remove(authority, uuid(data['id']));
  }
  return packOperation(store.stickerPacks, input);
}

function packOperation(
  packs: PublicProfileStore['stickerPacks'],
  input: {
    operation: string;
    authority: ContactAuthority;
    data: Record<string, unknown>;
  },
) {
  const { operation, authority, data } = input;
  if (operation === 'sticker-pack-save') {
    keys(data, ['id', 'name', 'stickers']);
    return packs.save(authority, {
      id: data['id'] === null ? null : uuid(data['id']),
      name: stickerPackName(data['name']),
      stickers: publicStickerIds(data['stickers'], publicStickerLimits.perPack),
    });
  }
  if (operation === 'sticker-pack-add') {
    keys(data, ['id', 'added']);
    if (typeof data['added'] !== 'boolean')
      throw new AccountError(400, 'Invalid pack choice.');
    return packs.add(authority, uuid(data['id']), data['added']);
  }
  if (operation === 'sticker-pack-browse') {
    keys(data, ['after']);
    return packs.browse(authority, packOffset(data['after']));
  }
  if (operation === 'sticker-pack-panel') {
    keys(data, []);
    return packs.panel(authority);
  }
  keys(data, ['id']);
  const id = uuid(data['id']);
  if (operation === 'sticker-pack-remove') return packs.remove(authority, id);
  if (operation === 'sticker-pack-read') return packs.read(authority, id);
  if (operation === 'sticker-pack-containing')
    return packs.containing(authority, id);
  throw new AccountError(404, 'Public profile operation not found.');
}

/** The browse list is short and ranked; a bounded offset is enough. */
function packOffset(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 2400 ||
    value % 24
  )
    throw new AccountError(400, 'Invalid page.');
  return value;
}
