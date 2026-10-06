import type { AccountSession } from '../../shared/account/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { preparePhoto } from '../attachment-images/index.ts';
import { PublicProfiles } from './controller.ts';
export { showPublicProfile } from './viewer.ts';

const template = `<article class="card public-profile-card"><h2>Perfil público</h2>
<p>Seu @ será visível na web. Wallet, nome e foto privados não são incluídos neste perfil.</p>
<div data-public-create><label>@ público<input data-public-input type="text" minlength="3" maxlength="31" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="seu_nome"></label>
<p>Use 3–30 letras sem acento, números ou _. O @ é único e não poderá ser alterado enquanto sua conta existir.</p>
<label class="public-consent"><input data-public-consent type="checkbox">Quero criar este perfil público com um @ fixo.</label>
<button type="button" class="primary" data-public-action="create">Criar perfil público</button></div>
<div data-public-owned hidden><div class="public-avatar-placeholder" data-public-placeholder aria-hidden="true">@</div><img class="public-avatar-preview" data-public-avatar alt="Prévia da sua foto pública, ainda restrita" hidden>
<p><strong data-public-own-handle></strong></p><a data-public-link>Ver perfil público</a>
<p>A foto é escolhida separadamente. PNG, JPEG e WebP são preparados neste aparelho, sem metadados, até 3 MB. Ela fica restrita a você até a moderação automática.</p>
<input data-public-file type="file" accept="image/png,image/jpeg,image/webp" hidden><button type="button" data-public-action="choose">Escolher foto pública</button><button type="button" data-public-action="remove">Remover foto preparada</button></div>
<p data-public-status role="status">Conecte e autorize seu aparelho para gerenciar o perfil público.</p><button type="button" data-public-action="reload">Recarregar perfil público</button></article>`;

export function startPublicProfile(access: VaultAccess) {
  const controller = new PublicProfiles(access);
  let mounted: HTMLElement | null = null,
    busy = false,
    generation = 0;
  let status =
    'Conecte e autorize seu aparelho para gerenciar o perfil público.';
  let photoUrl: string | null = null;
  function node<T extends HTMLElement>(selector: string): T | null {
    return mounted?.querySelector<T>(selector) ?? null;
  }
  function clearPhoto(): void {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
  }
  function renderIdentity(): void {
    const own = controller.profile;
    const create = node('[data-public-create]'),
      owned = node('[data-public-owned]');
    if (create) create.hidden = own !== null;
    if (owned) owned.hidden = own === null;
    const label = node('[data-public-own-handle]');
    if (label) label.textContent = own ? `@${own.profile.handle}` : '';
    const link = node<HTMLAnchorElement>('[data-public-link]');
    if (link && own)
      link.href = `#publico?handle=${encodeURIComponent(own.profile.handle)}`;
  }
  function renderControls(): void {
    const output = node('[data-public-status]');
    if (output) output.textContent = status;
    mounted?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
    const remove = node<HTMLButtonElement>('[data-public-action="remove"]');
    if (remove) remove.disabled = busy || !controller.profile?.pendingAvatar;
  }
  function renderPhoto(): void {
    const avatar = controller.profile?.pendingAvatar;
    clearPhoto();
    const photo = node<HTMLImageElement>('[data-public-avatar]');
    if (photo) {
      photo.hidden = !avatar;
      photo.removeAttribute('src');
      if (avatar) {
        photoUrl = URL.createObjectURL(
          new Blob([avatar.bytes], { type: avatar.type }),
        );
        photo.src = photoUrl;
      }
    }
    const placeholder = node('[data-public-placeholder]');
    if (placeholder) placeholder.hidden = Boolean(avatar);
  }
  function render(): void {
    renderIdentity();
    renderControls();
    renderPhoto();
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    const current = generation;
    render();
    try {
      await work();
    } catch (error: unknown) {
      if (current === generation)
        status =
          error instanceof Error
            ? error.message
            : 'Perfil público indisponível.';
    } finally {
      busy = false;
      if (current === generation) render();
      else ready();
    }
  }
  function ready(): void {
    if (!mounted) return;
    void run(async () => {
      await controller.refresh();
      status = controller.profile
        ? 'Perfil público restaurado.'
        : 'Você ainda não criou um perfil público.';
    });
  }
  function mount(container: HTMLElement): void {
    mounted = container;
    generation++;
    container.innerHTML = template;
    node('[data-public-action="reload"]')?.addEventListener('click', ready);
    node('[data-public-action="create"]')?.addEventListener('click', () => {
      const handle = node<HTMLInputElement>('[data-public-input]')?.value ?? '';
      const consent =
        node<HTMLInputElement>('[data-public-consent]')?.checked === true;
      void run(async () => {
        await controller.create(handle, consent);
        status = 'Perfil público criado. Seu @ é fixo.';
      });
    });
    node('[data-public-action="choose"]')?.addEventListener('click', () => {
      node<HTMLInputElement>('[data-public-file]')?.click();
    });
    node('[data-public-action="remove"]')?.addEventListener('click', () => {
      void run(async () => {
        await controller.avatar(null);
        status = 'Foto preparada removida.';
      });
    });
    node<HTMLInputElement>('[data-public-file]')?.addEventListener(
      'change',
      (event) => {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        const selectedGeneration = generation;
        void run(async () => {
          const photo = await preparePhoto(file);
          if (selectedGeneration !== generation)
            throw new Error('Sessão ou página alterada durante a preparação.');
          await controller.avatar({
            type: photo.type === 'image/png' ? 'image/png' : 'image/jpeg',
            bytes: photo.bytes,
          });
          status =
            'Foto preparada e salva. Ainda restrita a você; a publicação exige moderação automática.';
        });
      },
    );
    render();
    ready();
  }
  function leave(): void {
    mounted = null;
    generation++;
    clearPhoto();
  }
  return {
    mount,
    leave,
    ready,
    canActivate: () => !busy,
    setSession(session: AccountSession | null): void {
      if (!controller.setSession(session)) return;
      generation++;
      clearPhoto();
      status =
        'Conecte e autorize seu aparelho para gerenciar o perfil público.';
      render();
      ready();
    },
  };
}
