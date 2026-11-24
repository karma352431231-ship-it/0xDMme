import { encode, keys, object, uuid } from '../../shared/account/index.ts';
import type { PublicStickerFile } from '../../shared/public-stickers/index.ts';

/** One public sticker pack as the panel shows it. */
export interface StickerPack {
  id: string;
  name: string;
  owner: { id: string; handle: string };
  adds: number;
  stickers: string[];
  added: boolean;
  own: boolean;
}
export type SignedPerform = (
  operation: string,
  payload: Record<string, unknown>,
) => Promise<unknown>;

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum)
    throw new Error('Invalid pack.');
  return value;
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid pack.');
  return value;
}
function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid pack.');
  return value;
}
export function stickerPack(value: unknown): StickerPack {
  const data = object(value);
  keys(data, ['id', 'name', 'owner', 'adds', 'stickers', 'added', 'own']);
  const owner = object(data['owner']);
  keys(owner, ['id', 'handle']);
  const stickers = data['stickers'];
  if (!Array.isArray(stickers) || stickers.length > 30)
    throw new Error('Invalid pack.');
  return {
    id: uuid(data['id']),
    name: text(data['name'], 40),
    owner: { id: uuid(owner['id']), handle: text(owner['handle'], 40) },
    adds: count(data['adds']),
    stickers: stickers.map((item: unknown) => uuid(item)),
    added: flag(data['added']),
    own: flag(data['own']),
  };
}
function packList(value: unknown): StickerPack[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error('Invalid pack list.');
  return value.map(stickerPack);
}

/** Signed public sticker and pack requests of the signed-in profile. */
export class PublicStickerApi {
  private readonly perform: SignedPerform;
  /** Published copies of personal stickers this session, by sticker ID. */
  private readonly published = new Map<string, Promise<string>>();
  constructor(perform: SignedPerform) {
    this.perform = perform;
  }
  clear(): void {
    this.published.clear();
  }
  /** Publishes a file; the server returns the same ID for the same picture. */
  async upload(file: PublicStickerFile): Promise<string> {
    const data = object(
      await this.perform('sticker-upload', {
        file: { type: file.type, bytes: encode(file.bytes) },
      }),
    );
    keys(data, ['id']);
    return uuid(data['id']);
  }
  /** One upload per personal sticker and session, shared by every use. */
  publish(personal: string, file: PublicStickerFile): Promise<string> {
    const known = this.published.get(personal);
    if (known) return known;
    const upload = this.upload(file);
    upload.catch(() => this.published.delete(personal));
    this.published.set(personal, upload);
    return upload;
  }
  async panel(): Promise<StickerPack[]> {
    return packList(await this.perform('sticker-pack-panel', {}));
  }
  async browse(
    after: number,
  ): Promise<{ packs: StickerPack[]; next: number | null }> {
    const data = object(await this.perform('sticker-pack-browse', { after }));
    keys(data, ['packs', 'next']);
    const next = data['next'];
    return {
      packs: packList(data['packs']),
      next: next === null ? null : count(next),
    };
  }
  async containing(sticker: string): Promise<StickerPack | null> {
    const data = await this.perform('sticker-pack-containing', {
      id: sticker,
    });
    return data === null ? null : stickerPack(data);
  }
  async add(pack: string, added: boolean): Promise<void> {
    await this.perform('sticker-pack-add', { id: pack, added });
  }
  async save(input: {
    id: string | null;
    name: string;
    stickers: string[];
  }): Promise<StickerPack> {
    return stickerPack(await this.perform('sticker-pack-save', input));
  }
  async removePack(pack: string): Promise<void> {
    await this.perform('sticker-pack-remove', { id: pack });
  }
}
