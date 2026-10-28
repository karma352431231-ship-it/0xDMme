import { closePublicProfileGuidance } from '../public-action-guidance/index.ts';
import {
  forgetProfileReturn,
  publicProfileCreatedEvent,
  takeProfileReturn,
} from '../profile-shortcut/index.ts';
import { InteractionQueue } from '../interaction-queue/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { mentionNotificationPage } from '../../shared/mention-notifications/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { PublicModerationNotice } from '../../shared/public-moderation/index.ts';
import { PublicProfiles } from './controller.ts';
import { profileFollows } from './follows.ts';
import { startOwnProfileShortcut } from './own-shortcut.ts';
import { startModerationReview } from './moderation-review.ts';
import type { PublicModerationDetails } from '../../shared/moderation-details/index.ts';
import { renderModeration } from './moderation.ts';
import { showProfilePage } from './page.ts';
import { ModerationNotifications } from './moderation-notifications.ts';
import { startProfileEditor } from './profile-editor.ts';
import { profileHoverProvider } from './profile-hover.ts';
import { registerHoverCard } from '../hover-card/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { ActivityPosts } from '../communities/index.ts';

const template = t('html.d3072845e018');

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
  preview: (
    host: HTMLElement,
    detail: PublicModerationDetails,
    signal: AbortSignal,
  ) => void = () => undefined,
) {
  const controller = new PublicProfiles(access);
  const review = startModerationReview(controller, preview);
  const shortcut = startOwnProfileShortcut(controller);
  const notices = new ModerationNotifications(controller);
  const activity = new ActivityPosts(access, privacy);
  registerHoverCard(profileHoverProvider(controller));
  const editor = startProfileEditor(controller, {
    run,
    prepare: (work) => run(work, { quiet: true }),
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
    const own = controller.profile,
      known = controller.known;
    const create = node('[data-public-create]'),
      owned = node('[data-public-owned]');
    // Neither form until the profile state is known, so a reload never
    // flashes profile creation before the existing editor.
    if (create) create.hidden = !known || own !== null;
    if (owned) owned.hidden = !known || own === null;
    if (own) editor.paint();
  }
  function renderControls(): void {
    const mediaStatus = node('[data-external-media-status]');
    if (mediaStatus) mediaStatus.textContent = privacy.description();
    const output = node('[data-public-status]');
    if (output)
      output.textContent =
        status || (controller.known ? '' : t('Loading public profile…'));
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
    shortcut.paint();
    renderIdentity();
    renderControls();
    renderModeration(node('[data-public-moderation]'), {
      notices: blockingNotices(controller.notices),
      busy,
      appeal: (id, reason) => {
        void run(async () => {
          await controller.appeal(id, reason);
          status = t('Appeal recorded for exceptional review.');
        });
      },
    });
  }
  const operations = new InteractionQueue({
    generation: () => generation,
    changed: (value, quiet) => {
      busy = value;
      if (quiet) return;
      renderControls();
    },
    failed: (error) => {
      status =
        error instanceof Error
          ? translatedError(error.message)
          : t('Public profile unavailable.');
    },
    settled: (old) => {
      if (old === generation) render();
      else ready();
    },
  });
  function run(
    work: () => Promise<void>,
    options: { background?: boolean; quiet?: boolean } = {},
  ): Promise<void> {
    status = '';
    return operations.run(work, options);
  }
  function ready(): void {
    void review.ready();
    shortcut.ready();
    if (!mounted) return;
    void run(
      async () => {
        failed = true;
        await controller.refresh();
        await editor.refresh();
        if (controller.profile) await controller.refreshModeration();
        failed = false;
        status = controller.profile
          ? ''
          : t('You have not created a public profile yet.');
      },
      { background: true },
    );
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
      let created = false;
      void run(async () => {
        const choice = await privacy.beforeCreate(consentAbort.signal);
        if (choice === null) return;
        await controller.create(handle, true);
        created = true;
        window.dispatchEvent(new Event(publicProfileCreatedEvent));
        await editor.refresh();
        privacy.created(choice);
      }).then(() => {
        // After the queue settles, so the profile editor is already shown.
        if (created) offerReturn(takeProfileReturn());
      });
    });
  }
  /** After creation, lead back to the action that asked for a public profile. */
  function offerReturn(address: string | null): void {
    const owned = node('[data-public-owned]');
    if (!address || !owned) return;
    const notice = document.createElement('p'),
      back = document.createElement('a');
    notice.className = 'public-profile-return';
    notice.setAttribute('role', 'status');
    back.href = address;
    back.textContent = t('Go back to where you were');
    notice.append(`${t('Public profile created.')} `, back);
    owned.before(notice);
    back.focus();
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
    review.leave();
    editor.leave();
    consentAbort.abort();
    mounted = null;
    generation++;
  }
  return {
    /** `back` is the way to the feed this profile was opened from, if any. */
    show(container: HTMLElement, handle: unknown, back: string | null = null) {
      return showProfilePage(container, handle, {
        controller,
        back,
        renderEntry: (entry, signal) => activity.render(entry, signal),
      });
    },
    follows: profileFollows(controller),
    mountReview: review.mount,
    mentionNotifications: async () =>
      mentionNotificationPage(
        await controller.perform('mention-notifications', { after: null }),
      ).items,
    markMentionsRead: async (ids: readonly string[]) => {
      await controller.perform('mention-notifications-read', { ids });
    },
    moderationNotifications: () => notices.read(),
    markModerationRead: (ids: readonly string[]) => notices.markRead(ids),
    mount,
    leave,
    /** The way back from setup lasts only while setup stays open. */
    forgetReturn: forgetProfileReturn,
    ready,
    canActivate: () =>
      !busy &&
      !editor.hasDraft() &&
      activity.canActivate() &&
      review.canActivate(),
    async exists(): Promise<boolean> {
      return controller.exists();
    },
    setSession(session: AccountSession | null): void {
      activity.setSession(session);
      notices.setAccount(session?.accountId ?? null);
      if (!controller.setSession(session)) return;
      closePublicProfileGuidance();
      review.sessionChanged();
      shortcut.clear();
      editor.clear();
      generation++;
      status = '';
      render();
      ready();
    },
  };
}
