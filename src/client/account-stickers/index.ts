import { t, translatedError } from '../../shared/i18n/index.ts';
import { setImageViewerAction } from '../image-viewer/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { stickerLink } from '../../shared/stickers/index.ts';
import type { StickerReference } from '../../shared/stickers/index.ts';
import { publicStickerBlob } from '../public-media/index.ts';
import { StickerLibrary } from '../sticker-library/index.ts';
import type {
  PersonalSticker,
  StickerLibrarySync,
} from '../sticker-library/index.ts';
import { setAccountStickers } from '../stickers/index.ts';
import { prepareSticker } from './prepare.ts';
import type {
  AccountStickers,
  StickerSection,
  StickerTarget,
} from '../stickers/index.ts';
import { showToast } from '../toast/index.ts';
import { mineSection } from './mine.ts';
import type { MinePort } from './mine.ts';
import { browseSection, packSection } from './packs.ts';
import type { PackPort } from './packs.ts';
import { PublicStickerApi } from './public-api.ts';
import type { SignedPerform, StickerPack } from './public-api.ts';
import { openStickerSheet } from './sheet.ts';
import { openStickerSaveSheet } from './save-sheet.ts';
import type { SaveSheetPort } from './save-sheet.ts';

/**
 * The signed-in account's stickers (24/11/2026): the encrypted personal
 * library, the public packs it made or added, and saving pictures as
 * stickers. It owns their per-session caches and gives the sticker panel
 * its sections through `setAccountStickers`.
 */
export function startAccountStickers(input: {
  sync: StickerLibrarySync;
  perform: SignedPerform;
}): { setSession: (session: AccountSession | null) => void } {
  const owner = new AccountStickerOwner(input.sync, input.perform);
  return { setSession: (session) => owner.setSession(session) };
}

function chooseDevicePicture(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), {
      once: true,
    });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

class AccountStickerOwner {
  private readonly library: StickerLibrary;
  private readonly api: PublicStickerApi;
  private readonly images = new Map<string, string>();
  private account: string | null = null;
  private generation = 0;
  private packs: StickerPack[] | null = null;
  private loadingPacks = false;
  private readonly port: AccountStickers = {
    sections: (target) => this.sections(target),
    open: (sticker) => this.open(sticker),
    save: async (picture, frame) => {
      await this.offer(picture, frame);
    },
  };
  constructor(sync: StickerLibrarySync, perform: SignedPerform) {
    this.library = new StickerLibrary(sync);
    this.api = new PublicStickerApi(perform);
  }
  setSession(session: AccountSession | null): void {
    const account = session?.accountId ?? null;
    if (account === this.account) return;
    this.generation++;
    this.account = account;
    for (const url of this.images.values()) URL.revokeObjectURL(url);
    this.images.clear();
    this.library.clear();
    this.api.clear();
    this.packs = null;
    this.loadingPacks = false;
    setAccountStickers(account ? this.port : null);
    setImageViewerAction(
      account
        ? { label: t('Make sticker'), run: (url) => this.fromViewer(url) }
        : null,
    );
  }
  private sections(target: StickerTarget): StickerSection[] {
    this.loadPacks();
    const packs = this.packPort();
    return [
      mineSection(this.minePort(target)),
      ...(this.packs ?? []).map((pack) => packSection(pack, packs)),
      browseSection(packs),
    ];
  }
  /** Packs load in the background; the next panel opening shows them. */
  private loadPacks(): void {
    if (this.packs || this.loadingPacks) return;
    this.fetchPacks();
  }
  /**
   * Reads the packs again but keeps showing the current list meanwhile
   * (26/11/2026: clearing it hid every pack until the reload finished).
   */
  private fetchPacks(): void {
    const generation = this.generation;
    this.loadingPacks = true;
    this.api.panel().then(
      (packs) => this.packsLoaded(generation, packs),
      // Without a public profile there are no packs; the panel stays usable.
      () => this.packsLoaded(generation, this.packs ?? []),
    );
  }
  private packsLoaded(generation: number, packs: StickerPack[]): void {
    if (generation !== this.generation) return;
    this.packs = packs;
    this.loadingPacks = false;
  }
  /** A pack the server just saved shows at once, then the list is re-read. */
  private packSaved(saved: StickerPack): void {
    if (this.packs) {
      const others = this.packs.filter((pack) => pack.id !== saved.id);
      const at = this.packs.findIndex((pack) => pack.id === saved.id);
      this.packs =
        at < 0
          ? [...others, saved]
          : [...others.slice(0, at), saved, ...others.slice(at)];
    }
    this.fetchPacks();
  }
  private image(sticker: PersonalSticker): string {
    const known = this.images.get(sticker.id);
    if (known) return known;
    const url = URL.createObjectURL(
      new Blob([sticker.file.bytes], { type: sticker.file.type }),
    );
    this.images.set(sticker.id, url);
    return url;
  }
  /** Prepares and saves a picture; false when the person cancels framing. */
  private async keep(picture: Blob, frame: boolean): Promise<boolean> {
    const file = await prepareSticker(picture, frame);
    if (!file) return false;
    await this.library.add(file);
    showToast(t('Saved to your stickers.'), { success: true });
    return true;
  }
  /**
   * "Make sticker" and "Save sticker": prepares the picture or clip, then
   * asks where it goes (Favorites or a pack). False when cancelled.
   */
  private async offer(picture: Blob, frame: boolean): Promise<boolean> {
    const file = await prepareSticker(picture, frame);
    if (!file) return false;
    const saved = await openStickerSaveSheet(file, this.savePort());
    if (saved) showToast(t('Sticker saved.'), { success: true });
    return saved;
  }
  private savePort(): SaveSheetPort {
    return {
      favorites: async (file) => {
        await this.library.add(file);
      },
      ownPacks: async () => (await this.api.panel()).filter((pack) => pack.own),
      toPack: async (file, pack) => {
        // The same picture keeps its first address, so it may be there already.
        const id = await this.api.upload(file);
        if (pack.stickers.includes(id))
          throw new Error('This sticker is already in this pack.');
        this.packSaved(
          await this.api.save({
            id: pack.id,
            name: pack.name,
            stickers: [...pack.stickers, id],
          }),
        );
      },
      newPack: async (file, name) => {
        const id = await this.api.upload(file);
        this.packSaved(await this.api.save({ id: null, name, stickers: [id] }));
      },
    };
  }
  /** "Make sticker" under an enlarged public picture or chat GIF. */
  private fromViewer(url: string): void {
    void fetch(url)
      .then((response) => response.blob())
      .then((picture) => this.offer(picture, true))
      .catch((error: unknown) => {
        showToast(
          error instanceof Error
            ? translatedError(error.message)
            : t('Could not save the sticker.'),
        );
      });
  }
  private async publicLink(sticker: PersonalSticker): Promise<string> {
    return stickerLink(
      'public',
      await this.api.publish(sticker.id, sticker.file),
    );
  }
  private minePort(target: StickerTarget): MinePort {
    return {
      ids: () => this.library.ids(),
      open: (ids) => this.library.open(ids),
      image: (sticker) => this.image(sticker),
      addFromDevice: async () => {
        const picture = await chooseDevicePicture();
        return picture ? this.keep(picture, true) : false;
      },
      remove: async (ids) => {
        for (const id of ids) await this.library.remove(id);
      },
      publishPack: (stickers) => this.publishPack(stickers),
      use: async (sticker) => {
        if (target.file) return target.file(sticker.file);
        target.chosen(await this.publicLink(sticker));
      },
    };
  }
  private async publishPack(stickers: readonly PersonalSticker[]) {
    if (stickers.length > 30)
      throw new Error('A pack holds up to 30 stickers.');
    const name = window.prompt(t('Name the new pack'), '');
    if (name === null) return;
    const ids: string[] = [];
    for (const sticker of stickers) {
      const id = await this.api.publish(sticker.id, sticker.file);
      // Two copies of one picture publish to the same address.
      if (!ids.includes(id)) ids.push(id);
    }
    this.packSaved(await this.api.save({ id: null, name, stickers: ids }));
    showToast(t('Pack published. It appears in the panel.'), {
      success: true,
    });
  }
  private packPort(): PackPort {
    return {
      browse: (after) => this.api.browse(after),
      add: async (pack, added) => {
        await this.api.add(pack.id, added);
        this.fetchPacks();
      },
      removeOwn: async (pack) => {
        await this.api.removePack(pack.id);
        this.packs = (this.packs ?? []).filter((own) => own.id !== pack.id);
        this.fetchPacks();
      },
    };
  }
  private open(sticker: StickerReference): void {
    if (sticker.source !== 'public') return;
    openStickerSheet(sticker, {
      save: async (chosen) => {
        const blob = await publicStickerBlob(
          chosen.id,
          AbortSignal.timeout(15_000),
        );
        return this.offer(blob, false);
      },
      pack: (chosen) => this.api.containing(chosen.id),
      add: (pack, added) => this.packPort().add(pack, added),
    });
  }
}
