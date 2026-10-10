import type { AccountSession } from '../../shared/account/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { preparePhoto } from '../attachment-images/index.ts';
import { PublicProfiles } from './controller.ts';
import { renderModeration } from './moderation.ts';
import { showPublicProfile } from './viewer.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
export { showPublicProfile } from './viewer.ts';

const template = `<article class="card public-profile-card"><h2>Perfil público</h2>
<p>Seu @ será visível na web. Wallet, nome e foto privados não são incluídos neste perfil.</p>
<div data-public-create><label>@ público<input data-public-input type="text" minlength="3" maxlength="31" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="seu_nome"></label>
<p>3–30 letras sem acento, números ou _. Seu @ é único e fixo enquanto a conta existir.</p>
<button type="button" class="primary" data-public-action="create">Criar perfil público</button></div>
<div data-public-owned hidden><div class="public-avatar-placeholder" data-public-placeholder aria-hidden="true">@</div><img class="public-avatar-preview" data-public-avatar alt="Prévia da sua foto pública, ainda restrita" hidden>
<p><strong data-public-own-handle></strong></p>
<p>A foto pública é separada e fica restrita a você até a análise. Sem aprovação, é descartada em até sete dias.</p><details class="settings-help"><summary>Formatos e preparo da foto</summary><p>PNG, JPEG e WebP, até 3 MB, preparados neste aparelho sem metadados.</p></details>
<div class="settings-actions"><input data-public-file type="file" accept="image/png,image/jpeg,image/webp" hidden><button type="button" data-public-action="choose">Escolher foto pública</button><button type="button" data-public-action="remove">Remover foto preparada</button></div>
<section aria-label="Prévia do perfil público"><h3>Como outras pessoas veem seu perfil</h3><div data-public-preview></div></section></div>
<section data-public-moderation aria-label="Análises dos seus arquivos públicos"></section>
<div><button type="button" data-public-action="moderation-latest" hidden>Análises mais recentes</button><button type="button" data-public-action="moderation-older" hidden>Análises anteriores</button></div>
<p data-external-media-status role="status"></p><button type="button" data-public-action="external-media">Mídias externas</button>
<p data-public-status role="status">Conecte e autorize seu aparelho para gerenciar o perfil público.</p><button type="button" data-public-action="reload">Recarregar perfil público</button></article>`;

export function startPublicProfile(
  access: VaultAccess,
  privacy: ExternalMediaConsent,
) {
  const controller = new PublicProfiles(access);
  let mounted: HTMLElement | null = null,
    busy = false,
    generation = 0;
  let consentAbort = new AbortController();
  let status =
    'Conecte e autorize seu aparelho para gerenciar o perfil público.';
  let photoUrl: string | null = null;
  let previewKey = '',
    stopPreview: (() => void) | null = null;
  function node<T extends HTMLElement>(selector: string): T | null {
    return mounted?.querySelector<T>(selector) ?? null;
  }
  function clearPhoto(): void {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
  }
  function clearPreview(): void {
    stopPreview?.();
    stopPreview = null;
    previewKey = '';
    const preview = node('[data-public-preview]');
    if (preview) preview.innerHTML = '';
  }
  function renderPreview(): void {
    const own = controller.profile,
      preview = node('[data-public-preview]');
    if (!own || !preview || busy) return;
    const key = `${own.profile.id}:${own.revision}:${own.profile.avatar ?? ''}`;
    if (previewKey === key) return;
    clearPreview();
    previewKey = key;
    stopPreview = showPublicProfile(preview, own.profile.handle);
  }
  function renderIdentity(): void {
    const own = controller.profile;
    const create = node('[data-public-create]'),
      owned = node('[data-public-owned]');
    if (create) create.hidden = own !== null;
    if (owned) owned.hidden = own === null;
    const label = node('[data-public-own-handle]');
    if (label) label.textContent = own ? `@${own.profile.handle}` : '';
  }
  function renderControls(): void {
    const mediaStatus = node('[data-external-media-status]');
    if (mediaStatus) mediaStatus.textContent = privacy.description();
    const output = node('[data-public-status]');
    if (output) output.textContent = status;
    mounted?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
    const remove = node<HTMLButtonElement>('[data-public-action="remove"]');
    if (remove) remove.disabled = busy || !controller.profile?.pendingAvatar;
    const latest = node<HTMLButtonElement>(
        '[data-public-action="moderation-latest"]',
      ),
      older = node<HTMLButtonElement>(
        '[data-public-action="moderation-older"]',
      );
    if (latest) latest.hidden = controller.moderationAfter === null;
    if (older) older.hidden = controller.moderationOlder === null;
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
    renderPreview();
    renderModeration(node('[data-public-moderation]'), {
      notices: controller.notices,
      busy,
      appeal: (id, reason) => {
        void run(async () => {
          await controller.appeal(id, reason);
          status = 'Contestação registrada para revisão excepcional.';
        });
      },
    });
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
      if (controller.profile) await controller.refreshModeration();
      clearPreview();
      status = controller.profile
        ? 'Perfil público restaurado.'
        : 'Você ainda não criou um perfil público.';
    });
  }
  function mount(container: HTMLElement): void {
    consentAbort.abort();
    consentAbort = new AbortController();
    clearPreview();
    mounted = container;
    generation++;
    container.innerHTML = template;
    node('[data-public-action="reload"]')?.addEventListener('click', ready);
    for (const [action, cursor] of [
      ['moderation-latest', () => null],
      ['moderation-older', () => controller.moderationOlder],
    ] as const) {
      node(`[data-public-action="${action}"]`)?.addEventListener(
        'click',
        () => {
          void run(async () => {
            await controller.refreshModeration(cursor());
            status = 'Análises dos seus arquivos atualizadas.';
          });
        },
      );
    }
    node('[data-public-action="create"]')?.addEventListener('click', () => {
      const handle = node<HTMLInputElement>('[data-public-input]')?.value ?? '';
      void run(async () => {
        const choice = await privacy.beforeCreate(consentAbort.signal);
        if (choice === null) return;
        await controller.create(handle, true);
        privacy.created(choice);
        status = 'Perfil público criado. Seu @ é fixo.';
      });
    });
    node('[data-public-action="external-media"]')?.addEventListener(
      'click',
      () => {
        void run(() => privacy.configure(consentAbort.signal));
      },
    );
    privacy.subscribe(renderControls, consentAbort.signal);
    node('[data-public-action="choose"]')?.addEventListener('click', () => {
      node<HTMLInputElement>('[data-public-file]')?.click();
    });
    node('[data-public-action="remove"]')?.addEventListener('click', () => {
      void run(async () => {
        await controller.avatar(null);
        await controller.refreshModeration();
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
          await controller.refreshModeration();
          status =
            'Foto preparada e salva. Ainda restrita a você; a publicação exige moderação automática.';
        });
      },
    );
    render();
    ready();
  }
  function leave(): void {
    consentAbort.abort();
    clearPreview();
    mounted = null;
    generation++;
    clearPhoto();
  }
  return {
    mount,
    leave,
    ready,
    canActivate: () => !busy,
    async exists(): Promise<boolean> {
      return controller.exists();
    },
    setSession(session: AccountSession | null): void {
      if (!controller.setSession(session)) return;
      generation++;
      clearPhoto();
      clearPreview();
      status =
        'Conecte e autorize seu aparelho para gerenciar o perfil público.';
      render();
      ready();
    },
  };
}
