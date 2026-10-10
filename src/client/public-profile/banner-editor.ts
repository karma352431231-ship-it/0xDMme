import { encode } from '../../shared/account/index.ts';
import { profileBanner } from '../../shared/profile-social/index.ts';
import type { ProfileBanner } from '../../shared/profile-social/index.ts';
import { preparePhoto } from '../attachment-images/index.ts';
import type { PublicProfiles } from './controller.ts';

export function startBannerEditor(
  controller: PublicProfiles,
  options: {
    run: (work: () => Promise<void>) => Promise<void>;
    changed: (state: ProfileBanner) => Promise<void>;
  },
) {
  let host: HTMLElement | null = null,
    url: string | null = null,
    busy = false,
    generation = 0;
  let state: ProfileBanner = { revision: 0, banner: null };
  function clear(): void {
    if (url) URL.revokeObjectURL(url);
    url = null;
    state = { revision: 0, banner: null };
    generation++;
    host?.replaceChildren();
  }
  function render(): void {
    if (!host) return;
    if (url) URL.revokeObjectURL(url);
    url = null;
    host.innerHTML =
      '<h3>Banner público</h3><p>Imagem de capa separada da foto. Até 3 MB; preparada sem metadados neste aparelho. Só fica pública após aprovação.</p><img class="public-banner-prepared" alt="Prévia do seu banner, ainda restrita" hidden><input type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="settings-actions"><button type="button" data-banner-choose>Escolher banner</button><button type="button" data-banner-remove>Remover banner</button></div>';
    const image = host.querySelector('img')!,
      input = host.querySelector('input')!,
      remove = host.querySelector<HTMLButtonElement>('[data-banner-remove]')!;
    remove.disabled = !state.banner;
    if (state.banner) {
      url = URL.createObjectURL(
        new Blob([state.banner.bytes], { type: state.banner.type }),
      );
      image.src = url;
      image.hidden = false;
    }
    host
      .querySelector('[data-banner-choose]')
      ?.addEventListener('click', () => input.click());
    remove.addEventListener('click', () => {
      void options.run(() => save(null));
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      const old = generation;
      void options.run(async () => {
        const photo = await preparePhoto(file);
        if (old !== generation)
          throw new Error('Sessão ou página alterada durante a preparação.');
        await save({
          type: photo.type === 'image/png' ? 'image/png' : 'image/jpeg',
          bytes: encode(photo.bytes),
        });
      });
    });
    disable(busy);
  }
  function disable(value: boolean): void {
    busy = value;
    host?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
    const remove = host?.querySelector<HTMLButtonElement>(
      '[data-banner-remove]',
    );
    if (remove) remove.disabled = busy || !state.banner;
  }
  async function refresh(): Promise<void> {
    if (!host || !controller.profile) return;
    const old = generation;
    const next = profileBanner(await controller.perform('banner-state', {}));
    if (old !== generation) return;
    state = next;
    render();
  }
  async function save(
    banner: { type: string; bytes: string } | null,
  ): Promise<void> {
    const old = generation;
    const next = profileBanner(
      await controller.perform('banner', { revision: state.revision, banner }),
    );
    if (old !== generation) return;
    state = next;
    render();
    await options.changed(state);
  }
  return {
    disable,
    refresh,
    clear,
    mount(container: HTMLElement | null) {
      clear();
      host = container;
    },
    leave() {
      clear();
      host = null;
    },
  };
}
