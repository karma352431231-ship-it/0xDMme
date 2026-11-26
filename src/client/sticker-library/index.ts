import { base64, encode, keys, object } from '../../shared/account/index.ts';
import {
  publicStickerBytes,
  stickerFileFromBytes,
  stickerFileType,
} from '../../shared/public-stickers/index.ts';
import type { PublicStickerFile } from '../../shared/public-stickers/index.ts';
import type { VaultEntry, VaultSync } from '../vault-sync/index.ts';

/**
 * Personal stickers (owner decision of 24/11/2026): each sticker is its own
 * encrypted vault record, so the library follows the account to every device
 * and nothing about it reaches the server in the clear. Removing a sticker
 * writes a small version under another label on the same record, which the
 * list reads without decrypting anything.
 */
export const stickerLibraryLabel = '0xdmme:sticker:v1';
export const stickerRemovedLabel = '0xdmme:sticker-removed:v1';
export const personalStickerLimit = 120;
export interface PersonalSticker {
  id: string;
  file: PublicStickerFile;
}
export type StickerLibrarySync = Pick<
  VaultSync,
  'complete' | 'currentHeads' | 'heads' | 'openMany' | 'refresh' | 'save'
>;
const pageSize = 16;

function stickerEntry(entry: VaultEntry): boolean {
  return (
    entry.change.kind === 'settings' &&
    (entry.change.label === stickerLibraryLabel ||
      entry.change.label === stickerRemovedLabel)
  );
}
function newest(entries: readonly VaultEntry[]): VaultEntry | undefined {
  return [...entries].sort((a, b) => b.commit.sequence - a.commit.sequence)[0];
}
function decode(raw: string): PublicStickerFile {
  if (raw.length > Math.ceil(publicStickerBytes / 3) * 4 + 200)
    throw new Error('Invalid sticker.');
  const data = object(JSON.parse(raw) as unknown);
  keys(data, ['version', 'type', 'bytes']);
  const type = data['type'];
  if (data['version'] !== 1 || !stickerFileType(type))
    throw new Error('Invalid sticker.');
  return stickerFileFromBytes(base64(data['bytes'], publicStickerBytes), type);
}

export class StickerLibrary {
  private readonly sync: StickerLibrarySync;
  /** Decrypted files by version, so reopening the panel costs nothing. */
  private readonly opened = new Map<string, PublicStickerFile>();
  constructor(sync: StickerLibrarySync) {
    this.sync = sync;
  }
  /** Forget decrypted copies (sign-out or account change). */
  clear(): void {
    this.opened.clear();
  }
  private async ready(): Promise<void> {
    if (!this.sync.complete) await this.sync.refresh();
    if (!this.sync.complete)
      throw new Error('Your stickers are still syncing.');
  }
  /** Current sticker versions, newest first. */
  private async current(): Promise<VaultEntry[]> {
    await this.ready();
    const found: VaultEntry[] = [];
    for (const entries of this.sync.currentHeads().values()) {
      const head = newest(entries.filter(stickerEntry));
      if (head?.change.label === stickerLibraryLabel) found.push(head);
    }
    return found
      .sort((a, b) => b.commit.sequence - a.commit.sequence)
      .slice(0, personalStickerLimit);
  }
  /** IDs of the saved stickers, newest first, without decrypting them. */
  async ids(): Promise<string[]> {
    return (await this.current()).map((entry) => entry.change.entity);
  }
  /** Decrypts the given stickers, sixteen per vault read. */
  async open(ids: readonly string[]): Promise<PersonalSticker[]> {
    const wanted = new Set(ids);
    const entries = (await this.current()).filter((entry) =>
      wanted.has(entry.change.entity),
    );
    const missing = entries.filter(
      (entry) => !this.opened.has(entry.commit.id),
    );
    for (let start = 0; start < missing.length; start += pageSize) {
      const page = missing.slice(start, start + pageSize);
      const values = await this.sync.openMany(
        page.map((entry) => entry.commit.id),
      );
      page.forEach((entry, index) => {
        try {
          this.opened.set(entry.commit.id, decode(values[index]!));
        } catch {
          // A damaged record stays out of the panel; the others still show.
        }
      });
    }
    return entries.flatMap((entry) => {
      const file = this.opened.get(entry.commit.id);
      return file ? [{ id: entry.change.entity, file }] : [];
    });
  }
  /** Saves a prepared sticker as a new record; returns its ID. */
  async add(file: PublicStickerFile): Promise<string> {
    if ((await this.current()).length >= personalStickerLimit)
      throw new Error('Sticker limit reached. Delete a sticker first.');
    const entity = crypto.randomUUID();
    await this.sync.save({
      change: {
        version: 1,
        entity,
        kind: 'settings',
        parents: [],
        label: stickerLibraryLabel,
      },
      value: JSON.stringify({
        version: 1,
        type: file.type,
        bytes: encode(file.bytes),
      }),
    });
    return entity;
  }
  async remove(id: string): Promise<void> {
    await this.ready();
    const parents = this.sync
      .heads(id)
      .filter(stickerEntry)
      .map((entry) => entry.commit.id);
    if (!parents.length) return;
    await this.sync.save({
      change: {
        version: 1,
        entity: id,
        kind: 'settings',
        parents,
        label: stickerRemovedLabel,
      },
      value: JSON.stringify({ version: 1, removed: true }),
    });
  }
}
