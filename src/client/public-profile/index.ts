import type { AccountSession } from '../../shared/account/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { PublicModerationNotice } from '../../shared/public-moderation/index.ts';
import { PublicProfiles } from './controller.ts';
import { renderModeration } from './moderation.ts';
import { showProfilePage } from './page.ts';
import { startProfileEditor } from './profile-editor.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { ActivityPosts } from '../communities/index.ts';

const template = `<article class="card public-profile-card"><h2>Perfil público</h2>
<div data-public-create><p>Seu @, atividade pública e todas as comunidades que você segue ficam visíveis na web. Wallet, nome e foto privados não são incluídos neste perfil.</p><label>@ público<input data-public-input type="text" minlength="3" maxlength="31" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="seu_nome"></label>
<p>3–30 letras sem acento, números ou _. Seu @ é único e fixo enquanto a conta existir.</p>
<button type="button" class="primary" data-public-action="create">Criar perfil público</button></div>
<div data-public-owned hidden></div>
<section data-public-moderation aria-label="Arquivos públicos recusados"></section>
<div><button type="button" data-public-action="moderation-latest" hidden>Avisos mais recentes</button><button type="button" data-public-action="moderation-older" hidden>Avisos anteriores</button></div>
<p data-external-media-status role="status"></p><button type="button" data-public-action="external-media">Mídias externas</button>
<p data-public-status role="status"></p><button type="button" data-public-action="reload" hidden>Tentar de novo</button></article>`;

/**
 * Only outcomes that keep a file off the public profile reach the owner;
 * approved, pending and replaced files raise no notice.
 */
const blockingStatuses: readonly PublicModerationNotice['status'][] = [
  'rejected',
  'held',
  'failed',
  'discarding',
  'expired',
];
export function blockingNotices(
  notices: readonly PublicModerationNotice[],
): PublicModerationNotice[] {
  return notices.filter((notice) => blockingStatuses.includes(notice.status));
}

export function startPublicProfile(
  access: VaultAccess,
  privacy: ExternalMediaConsent,
) {
  const controller = new PublicProfiles(access);
  const activity = new ActivityPosts(access, privacy);
  const editor = startProfileEditor(controller, {
    run,
    changed: () => controller.refreshModeration(),
  });
  let mounted: HTMLElement | null = null,
    busy = false,
    failed = false,
    generation = 0;
  let consentAbort = new AbortController();
  // Only failures are reported; a successful edit shows itself in the editor.
  let status = '';
  function node<T extends HTMLElement>(selector: string): T | null {
    return mounted?.querySelector<T>(selector) ?? null;
  }
  function renderIdentity(): void {
    const own = controller.profile;
    const create = node('[data-public-create]'),
      owned = node('[data-public-owned]');
    if (create) create.hidden = own !== null;
    if (owned) owned.hidden = own === null;
    if (own) editor.paint();
  }
  function renderControls(): void {
    const mediaStatus = node('[data-external-media-status]');
    if (mediaStatus) mediaStatus.textContent = privacy.description();
    const output = node('[data-public-status]');
    if (output) output.textContent = status;
    mounted?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
    editor.disable(busy);
    const reload = node('[data-public-action="reload"]');
    if (reload) reload.hidden = !failed;
    const latest = node('[data-public-action="moderation-latest"]'),
      older = node('[data-public-action="moderation-older"]');
    if (latest) latest.hidden = controller.moderationAfter === null;
    if (older) older.hidden = controller.moderationOlder === null;
  }
  function render(): void {
    renderIdentity();
    renderControls();
    renderModeration(node('[data-public-moderation]'), {
      notices: blockingNotices(controller.notices),
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
    status = '';
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
      failed = true;
      await controller.refresh();
      await editor.refresh();
      if (controller.profile) await controller.refreshModeration();
      failed = false;
      status = controller.profile
        ? ''
        : 'Você ainda não criou um perfil público.';
    });
  }
  function bindModeration(): void {
    for (const [action, cursor] of [
      ['moderation-latest', () => null],
      ['moderation-older', () => controller.moderationOlder],
    ] as const) {
      node(`[data-public-action="${action}"]`)?.addEventListener(
        'click',
        () => {
          void run(() => controller.refreshModeration(cursor()));
        },
      );
    }
  }
  function bindCreate(): void {
    node('[data-public-action="create"]')?.addEventListener('click', () => {
      const handle = node<HTMLInputElement>('[data-public-input]')?.value ?? '';
      void run(async () => {
        const choice = await privacy.beforeCreate(consentAbort.signal);
        if (choice === null) return;
        await controller.create(handle, true);
        await editor.refresh();
        privacy.created(choice);
      });
    });
  }
  function mount(container: HTMLElement): void {
    consentAbort.abort();
    consentAbort = new AbortController();
    mounted = container;
    generation++;
    container.innerHTML = template;
    editor.mount(node('[data-public-owned]'));
    node('[data-public-action="reload"]')?.addEventListener('click', ready);
    bindModeration();
    bindCreate();
    node('[data-public-action="external-media"]')?.addEventListener(
      'click',
      () => {
        void run(() => privacy.configure(consentAbort.signal));
      },
    );
    privacy.subscribe(renderControls, consentAbort.signal);
    render();
    ready();
  }
  function leave(): void {
    editor.leave();
    consentAbort.abort();
    mounted = null;
    generation++;
  }
  return {
    show(container: HTMLElement, handle: unknown) {
      return showProfilePage(container, handle, {
        controller,
        renderEntry: (entry, signal) => activity.render(entry, signal),
      });
    },
    mount,
    leave,
    ready,
    canActivate: () => !busy && activity.canActivate(),
    async exists(): Promise<boolean> {
      return controller.exists();
    },
    setSession(session: AccountSession | null): void {
      activity.setSession(session);
      if (!controller.setSession(session)) return;
      editor.clear();
      generation++;
      status = '';
      render();
      ready();
    },
  };
}
