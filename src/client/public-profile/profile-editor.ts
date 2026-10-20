import { t } from '../../shared/i18n/index.ts';
import {
  mountMentionInput,
  mentionValue,
  setMentionValue,
} from '../public-mentions/index.ts';
import { mentionPlainText } from '../../shared/public-mentions/index.ts';
import { encode } from '../../shared/account/index.ts';
import {
  profileBanner,
  profileDescription,
  profileDescriptionLength,
  profileDescriptionText,
} from '../../shared/profile-social/index.ts';
import type {
  ProfileBanner,
  ProfileDescription,
} from '../../shared/profile-social/index.ts';
import { preparePhoto } from '../attachment-images/index.ts';
import { avatarCrop, bannerCrop, cropImage } from '../image-crop/index.ts';
import { EditorImagePreview } from '../image-editor-preview/index.ts';
import type { PublicProfiles } from './controller.ts';

const trash =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const template = t('html.b1c18c8a59fa', [trash, trash]);

type Target = 'banner' | 'avatar';
interface Image {
  type: 'image/png' | 'image/jpeg';
  bytes: Uint8Array<ArrayBuffer>;
}
/**
 * The owner edits the public profile where it is seen: a click on the banner
 * or the photo prepares a local preview; confirmation sends the draft.
 * Files are prepared on this device, as before; what is shown is the owner's
 * own copy, so a file under analysis is visible here before it is public.
 */
export function startProfileEditor(
  controller: PublicProfiles,
  options: {
    run: (work: () => Promise<void>) => Promise<void>;
    /** A file changed: its analysis notice may have changed too. */
    changed: () => Promise<void>;
    prepare: (work: () => Promise<void>) => Promise<void>;
  },
) {
  let host: HTMLElement | null = null,
    target: Target = 'avatar',
    generation = 0,
    mentionsAbort = new AbortController();
  let bannerPreview: EditorImagePreview | null = null,
    avatarPreview: EditorImagePreview | null = null;
  let draftAvatar: Image | null | undefined,
    draftAvatarRevision: number | undefined,
    draftBanner: Image | null | undefined,
    draftDescription: string | null = null;
  let banner: ProfileBanner = { revision: 0, banner: null };
  let description: ProfileDescription = { revision: 0, description: '' };
  function node<T extends HTMLElement>(selector: string): T | null {
    return host?.querySelector<T>(selector) ?? null;
  }
  function release(): void {
    bannerPreview?.clear();
    avatarPreview?.clear();
    bannerPreview = null;
    avatarPreview = null;
  }
  function paintBanner(): void {
    const bytes = draftBanner === undefined ? banner.banner : draftBanner;
    bannerPreview?.show(bytes);
    const remove = node('[data-remove="banner"]');
    if (remove) remove.hidden = !bytes;
  }
  function paintAvatar(): void {
    const own = controller.profile;
    if (!own) return;
    const photo = draftAvatar === undefined ? own.pendingAvatar : draftAvatar,
      fallback = draftAvatar === undefined ? own.profile.avatar : null;
    avatarPreview?.show(
      photo,
      fallback ? { target: own.profile.id, reference: fallback } : null,
    );
    const remove = node('[data-remove="avatar"]');
    if (remove) remove.hidden = !photo && !fallback;
  }
  function paintDescription(): void {
    const field = node<HTMLTextAreaElement>('[data-public-description]');
    // Never overwrite what the owner is typing.
    if (field && document.activeElement !== field)
      setMentionValue(field, draftDescription ?? description.description);
    count();
  }
  function count(): void {
    const field = node<HTMLTextAreaElement>('[data-public-description]'),
      counter = node('[data-description-count]');
    if (!field || !counter) return;
    const used = [...mentionPlainText(mentionValue(field).trim())].length;
    counter.textContent = `${used}/${profileDescriptionLength}`;
    counter.dataset['over'] = String(used > profileDescriptionLength);
  }
  function paint(): void {
    const own = controller.profile;
    if (!host || !own) return;
    const handle = node('[data-public-own-handle]');
    if (handle) handle.textContent = `@${own.profile.handle}`;
    const page = node<HTMLAnchorElement>('[data-public-page]');
    if (page)
      page.href = `#users?handle=${encodeURIComponent(own.profile.handle)}`;
    paintBanner();
    paintAvatar();
    paintDescription();
  }
  async function refresh(): Promise<void> {
    if (!host || !controller.profile) return;
    const old = generation;
    const [nextBanner, nextDescription] = await Promise.all([
      controller.perform('banner-state', {}).then(profileBanner),
      controller.perform('description-state', {}).then(profileDescription),
    ]);
    if (old !== generation) return;
    if (draftBanner === undefined) banner = nextBanner;
    if (draftDescription === null) description = nextDescription;
    paint();
  }
  async function saveBanner(next: Image | null): Promise<void> {
    const old = generation;
    const saved = profileBanner(
      await controller.perform('banner', {
        revision: banner.revision,
        banner: next ? { type: next.type, bytes: encode(next.bytes) } : null,
      }),
    );
    if (old !== generation) return;
    banner = saved;
    paint();
  }
  async function saveDescription(text: string): Promise<void> {
    const value = profileDescriptionText(text);
    if (value === description.description) return;
    const old = generation;
    const saved = profileDescription(
      await controller.perform('description', {
        revision: description.revision,
        description: value,
      }),
    );
    if (old !== generation) return;
    description = saved;
    paintDescription();
    const finish = node('[data-description-save]');
    if (finish) finish.hidden = true;
  }
  async function choose(file: File, kind: Target): Promise<void> {
    const old = generation;
    // Frame first (16/10/2026); cancel keeps the current picture.
    const framed = await cropImage(
      file,
      kind === 'banner' ? bannerCrop : avatarCrop,
    );
    if (!framed) return;
    const photo = await preparePhoto(framed);
    if (old !== generation)
      throw new Error('Session or page changed during preparation.');
    const image: Image = {
      type: photo.type === 'image/png' ? 'image/png' : 'image/jpeg',
      bytes: photo.bytes,
    };
    if (kind === 'banner') draftBanner = image;
    else {
      draftAvatar = image;
      draftAvatarRevision = controller.profile?.revision;
    }
    paint();
  }
  async function saveAvatar(image: Image | null): Promise<void> {
    await controller.avatar(image, draftAvatarRevision);
    paint();
  }
  async function confirm(): Promise<void> {
    // Validate before the first write. Successful parts are cleared so a retry
    // cannot accidentally resend an earlier image after a later failure.
    const text = profileDescriptionText(
      draftDescription ?? description.description,
    );
    if (draftDescription !== null) {
      await saveDescription(text);
      draftDescription = null;
    }
    if (draftBanner !== undefined) {
      await saveBanner(draftBanner);
      draftBanner = undefined;
    }
    if (draftAvatar !== undefined) {
      await saveAvatar(draftAvatar);
      draftAvatar = undefined;
      draftAvatarRevision = undefined;
    }
    paint();
    await options.changed();
  }
  function disable(busy: boolean): void {
    host
      ?.querySelectorAll<
        HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement
      >('button,input,textarea')
      .forEach((button) => {
        button.disabled = busy;
      });
  }
  function prepare(work: () => Promise<void>): Promise<void> {
    return options.prepare(async () => {
      disable(true);
      try {
        await work();
      } finally {
        disable(false);
      }
    });
  }
  function bind(): void {
    const input = node<HTMLInputElement>('[data-pick-file]');
    host?.querySelectorAll<HTMLElement>('[data-pick]').forEach((button) => {
      button.addEventListener('click', () => {
        target = button.dataset['pick'] === 'banner' ? 'banner' : 'avatar';
        input?.click();
      });
    });
    input?.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      const kind = target;
      if (file) void prepare(() => choose(file, kind));
    });
    node('[data-remove="banner"]')?.addEventListener('click', () => {
      void prepare(() => {
        draftBanner = null;
        paint();
        return Promise.resolve();
      });
    });
    node('[data-remove="avatar"]')?.addEventListener('click', () => {
      void prepare(() => {
        draftAvatar = null;
        draftAvatarRevision = controller.profile?.revision;
        paint();
        return Promise.resolve();
      });
    });
    const field = node<HTMLTextAreaElement>('[data-public-description]');
    if (field) mountMentionInput(field, mentionsAbort.signal);
    field?.addEventListener('input', () => {
      draftDescription = mentionValue(field);
      count();
    });
    node('[data-confirm-profile]')?.addEventListener('click', () => {
      void options.run(confirm);
    });
  }
  return {
    paint,
    refresh,
    hasDraft: () =>
      draftAvatar !== undefined ||
      draftBanner !== undefined ||
      (draftDescription !== null &&
        draftDescription.trim() !== description.description),
    disable,
    mount(container: HTMLElement | null): void {
      mentionsAbort.abort();
      mentionsAbort = new AbortController();
      release();
      generation++;
      draftAvatar = undefined;
      draftAvatarRevision = undefined;
      draftBanner = undefined;
      draftDescription = null;
      host = container;
      if (!container) return;
      container.innerHTML = template;
      const bannerImage = node<HTMLImageElement>('[data-pick="banner"] img'),
        avatarSlot = node('[data-avatar-slot]');
      if (bannerImage)
        bannerPreview = new EditorImagePreview(bannerImage, bannerImage);
      if (avatarSlot) avatarPreview = new EditorImagePreview(avatarSlot);
      bind();
    },
    clear(): void {
      bannerPreview?.clear();
      avatarPreview?.clear();
      generation++;
      draftAvatar = undefined;
      draftAvatarRevision = undefined;
      draftBanner = undefined;
      draftDescription = null;
      banner = { revision: 0, banner: null };
      description = { revision: 0, description: '' };
    },
    leave(): void {
      mentionsAbort.abort();
      release();
      generation++;
      host = null;
    },
  };
}
