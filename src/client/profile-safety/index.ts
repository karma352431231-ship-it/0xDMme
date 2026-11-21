import { t, translatedError } from '../../shared/i18n/index.ts';
import { publicBlockState } from '../../shared/profile-social/index.ts';
import {
  profileMuteState,
  safetyProfilePage,
} from '../../shared/profile-mutes/index.ts';
import type { ProfileMuteState } from '../../shared/profile-mutes/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import { publicIdentityAvatar } from '../public-identity/index.ts';
import {
  clearLoading,
  loadingPlaceholder,
} from '../loading-placeholder/index.ts';

/** The signed public-profile operations this page needs; nothing else. */
export interface SafetyPort {
  perform(
    operation: string,
    payload: Record<string, unknown>,
  ): Promise<unknown>;
}
export type SafetyTab = 'muted' | 'blocked' | 'hidden';

/**
 * Mute and block (owner, 20/11/2026): one place for the profiles someone
 * muted or blocked and the posts they hid. Muting hides that profile's posts,
 * replies and notices from this profile only.
 */
export function safetyTabs(host: HTMLElement, current: SafetyTab): void {
  const nav = document.createElement('nav');
  nav.className = 'safety-tabs';
  nav.setAttribute('aria-label', t('Mute and block'));
  for (const [tab, label, href] of [
    ['muted', t('Muted'), '#communities?view=mute-block'],
    ['blocked', t('Blocked'), '#communities?view=mute-block&tab=blocked'],
    ['hidden', t('Hidden posts'), '#communities?view=hidden'],
  ] as const) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    if (tab === current) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  host.append(nav);
}

/** Reads whether `target` is muted, then writes the opposite choice. */
export async function setProfileMute(
  port: SafetyPort,
  target: string,
  muted: boolean,
): Promise<ProfileMuteState> {
  const current = profileMuteState(
    await port.perform('mute-state', { target }),
  );
  if (current.muted === muted) return current;
  return profileMuteState(
    await port.perform('mute', { target, muted, revision: current.revision }),
  );
}

async function unblock(port: SafetyPort, target: string): Promise<void> {
  const current = publicBlockState(
    await port.perform('block-state', { target }),
  );
  if (current.blocked)
    await port.perform('block', {
      target,
      blocked: false,
      revision: current.revision,
    });
  window.dispatchEvent(
    new CustomEvent('0xdmme-public-block', {
      detail: { target, blocked: false },
    }),
  );
}

/** The Muted or Blocked list, paged by the server, with undo on each row. */
export function mountSafetyPage(
  host: HTMLElement,
  input: { port: SafetyPort; tab: 'muted' | 'blocked'; signal: AbortSignal },
): void {
  const page = document.createElement('section');
  page.className = 'safety-page';
  const heading = document.createElement('h1');
  heading.textContent = t('Mute and block');
  page.append(heading);
  safetyTabs(page, input.tab);
  const hint = document.createElement('p');
  hint.className = 'safety-hint';
  hint.textContent =
    input.tab === 'muted'
      ? t(
          'Posts, replies and notices from these profiles are hidden for you. They are not told.',
        )
      : t(
          'These profiles cannot message you, and you do not see each other’s posts.',
        );
  const list = document.createElement('ul');
  list.className = 'safety-list';
  const status = document.createElement('p');
  status.className = 'safety-status';
  status.setAttribute('role', 'status');
  page.append(hint, list, status);
  host.replaceChildren(page);
  void loadPage(list, status, { ...input, after: null });
}

async function loadPage(
  list: HTMLElement,
  status: HTMLElement,
  input: {
    port: SafetyPort;
    tab: 'muted' | 'blocked';
    signal: AbortSignal;
    after: string | null;
  },
): Promise<void> {
  status.textContent = '';
  list.append(loadingPlaceholder('rows', t('Loading…')));
  try {
    const page = safetyProfilePage(
      await input.port.perform(
        input.tab === 'muted' ? 'mute-list' : 'block-list',
        { after: input.after },
      ),
    );
    if (input.signal.aborted) return;
    clearLoading(list);
    for (const profile of page.items) list.append(row(profile, input, status));
    if (!list.childElementCount)
      status.textContent =
        input.tab === 'muted'
          ? t('You have not muted anyone.')
          : t('You have not blocked anyone.');
    if (page.next) moreButton(list, status, { ...input, after: page.next });
  } catch (error: unknown) {
    clearLoading(list);
    if (!input.signal.aborted) status.textContent = failure(error);
  }
}

function moreButton(
  list: HTMLElement,
  status: HTMLElement,
  input: Parameters<typeof loadPage>[2],
): void {
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'safety-more';
  more.textContent = t('Show more');
  more.addEventListener('click', () => {
    more.remove();
    void loadPage(list, status, input);
  });
  list.after(more);
}

function row(
  profile: PublicProfile,
  input: { port: SafetyPort; tab: 'muted' | 'blocked'; signal: AbortSignal },
  status: HTMLElement,
): HTMLLIElement {
  const item = document.createElement('li');
  const name = document.createElement('a');
  name.href = `#users?id=${profile.id}`;
  name.textContent = `@${profile.handle}`;
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.textContent = input.tab === 'muted' ? t('Unmute') : t('Unblock');
  undo.addEventListener('click', () => {
    undo.disabled = true;
    const work =
      input.tab === 'muted'
        ? setProfileMute(input.port, profile.id, false)
        : unblock(input.port, profile.id);
    void work
      .then(() => {
        if (!input.signal.aborted) item.remove();
      })
      .catch((error: unknown) => {
        undo.disabled = false;
        if (!input.signal.aborted) status.textContent = failure(error);
      });
  });
  item.append(publicIdentityAvatar(profile, input.signal), name, undo);
  return item;
}

function failure(error: unknown): string {
  return error instanceof Error
    ? translatedError(error.message)
    : t('Operation unavailable. Check the state before retrying.');
}
