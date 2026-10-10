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
import { showPublicAvatar } from '../public-media/index.ts';
import type { PublicProfiles } from './controller.ts';

const trash =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const template = `<div class="profile-editor">
<div class="profile-editor-banner"><button type="button" class="profile-editor-pick" data-pick="banner" aria-label="Trocar banner"><img alt="" hidden><span class="profile-editor-hint">Trocar banner</span></button><button type="button" class="profile-editor-remove" data-remove="banner" aria-label="Remover banner" title="Remover banner" hidden>${trash}</button></div>
<div class="profile-editor-identity"><div class="profile-editor-avatar"><button type="button" class="profile-editor-pick" data-pick="avatar" aria-label="Trocar foto"><span data-avatar-slot>@</span></button><button type="button" class="profile-editor-remove" data-remove="avatar" aria-label="Remover foto" title="Remover foto" hidden>${trash}</button></div>
<div class="profile-editor-title"><h3 data-public-own-handle></h3><a data-public-page>Ver meu perfil público</a></div></div>
<label class="profile-editor-description"><span>Descrição</span><textarea data-public-description rows="3" placeholder="Conte quem você é. Só texto e emojis."></textarea><small data-description-count></small></label>
<input type="file" data-pick-file accept="image/png,image/jpeg,image/webp" hidden></div>`;

type Target = 'banner' | 'avatar';
interface Image {
  type: 'image/png' | 'image/jpeg';
  bytes: Uint8Array<ArrayBuffer>;
}
function blobUrl(image: Image): string {
  return URL.createObjectURL(new Blob([image.bytes], { type: image.type }));
}
function decoded(banner: ProfileBanner['banner']): Image | null {
  return banner ? { type: banner.type, bytes: banner.bytes } : null;
}

/**
 * The owner edits the public profile where it is seen: a click on the banner
 * or the photo replaces it, the description is saved when the field is left.
 * Files are prepared on this device, as before; what is shown is the owner's
 * own copy, so a file under analysis is visible here before it is public.
 */
export function startProfileEditor(
  controller: PublicProfiles,
  options: {
    run: (work: () => Promise<void>) => Promise<void>;
    /** A file changed: its analysis notice may have changed too. */
    changed: () => Promise<void>;
  },
) {
  let host: HTMLElement | null = null,
    target: Target = 'avatar',
    generation = 0,
    avatarAbort = new AbortController();
  const urls: string[] = [];
  let banner: ProfileBanner = { revision: 0, banner: null };
  let description: ProfileDescription = { revision: 0, description: '' };
  function node<T extends HTMLElement>(selector: string): T | null {
    return host?.querySelector<T>(selector) ?? null;
  }
  function release(): void {
    for (const url of urls.splice(0)) URL.revokeObjectURL(url);
    avatarAbort.abort();
    avatarAbort = new AbortController();
  }
  function paintBanner(): void {
    const image = node<HTMLImageElement>('[data-pick="banner"] img'),
      bytes = decoded(banner.banner);
    if (image) {
      image.hidden = !bytes;
      if (bytes) urls.push((image.src = blobUrl(bytes)));
      else image.removeAttribute('src');
    }
    const remove = node('[data-remove="banner"]');
    if (remove) remove.hidden = !bytes;
  }
  function paintAvatar(): void {
    const slot = node('[data-avatar-slot]'),
      own = controller.profile;
    if (!slot || !own) return;
    slot.replaceChildren();
    const remove = node('[data-remove="avatar"]');
    if (remove) remove.hidden = !own.pendingAvatar;
    if (own.pendingAvatar) {
      const image = document.createElement('img');
      image.alt = '';
      urls.push((image.src = blobUrl(own.pendingAvatar)));
      slot.append(image);
    } else if (own.profile.avatar)
      showPublicAvatar(slot, {
        kind: 'avatar',
        target: own.profile.id,
        reference: own.profile.avatar,
        signal: avatarAbort.signal,
      });
    else slot.textContent = '@';
  }
  function paintDescription(): void {
    const field = node<HTMLTextAreaElement>('[data-public-description]');
    // Never overwrite what the owner is typing.
    if (field && document.activeElement !== field)
      field.value = description.description;
    count();
  }
  function count(): void {
    const field = node<HTMLTextAreaElement>('[data-public-description]'),
      counter = node('[data-description-count]');
    if (!field || !counter) return;
    const used = [...field.value.trim()].length;
    counter.textContent = `${used}/${profileDescriptionLength}`;
    counter.dataset['over'] = String(used > profileDescriptionLength);
  }
  function paint(): void {
    const own = controller.profile;
    if (!host || !own) return;
    release();
    const handle = node('[data-public-own-handle]');
    if (handle) handle.textContent = `@${own.profile.handle}`;
    const page = node<HTMLAnchorElement>('[data-public-page]');
    if (page)
      page.href = `#publico?handle=${encodeURIComponent(own.profile.handle)}`;
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
    banner = nextBanner;
    description = nextDescription;
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
    await options.changed();
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
  }
  async function choose(file: File): Promise<void> {
    const old = generation,
      kind = target;
    const photo = await preparePhoto(file);
    if (old !== generation)
      throw new Error('Sessão ou página alterada durante a preparação.');
    const image: Image = {
      type: photo.type === 'image/png' ? 'image/png' : 'image/jpeg',
      bytes: photo.bytes,
    };
    if (kind === 'banner') await saveBanner(image);
    else await saveAvatar(image);
  }
  async function saveAvatar(image: Image | null): Promise<void> {
    await controller.avatar(image);
    paint();
    await options.changed();
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
      if (file) void options.run(() => choose(file));
    });
    node('[data-remove="banner"]')?.addEventListener('click', () => {
      void options.run(() => saveBanner(null));
    });
    node('[data-remove="avatar"]')?.addEventListener('click', () => {
      void options.run(() => saveAvatar(null));
    });
    const field = node<HTMLTextAreaElement>('[data-public-description]');
    field?.addEventListener('input', count);
    field?.addEventListener('change', () => {
      void options.run(() => saveDescription(field.value));
    });
  }
  return {
    paint,
    refresh,
    disable(busy: boolean): void {
      host?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
        button.disabled = busy;
      });
    },
    mount(container: HTMLElement | null): void {
      release();
      generation++;
      host = container;
      if (!container) return;
      container.innerHTML = template;
      bind();
    },
    clear(): void {
      release();
      generation++;
      banner = { revision: 0, banner: null };
      description = { revision: 0, description: '' };
    },
    leave(): void {
      release();
      generation++;
      host = null;
    },
  };
}
