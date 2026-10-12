import { communityFollowers } from '../../shared/community-followers/index.ts';
import type {
  CommunityFollowerTab,
  CommunityFollowers,
} from '../../shared/community-followers/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import type { Communities } from './controller.ts';
import { communityRead } from './controller.ts';
import { communityElement as el } from './elements.ts';
interface FollowersAccess {
  id: string;
  signedIn: boolean;
  controller: Communities;
  signal: AbortSignal;
}
function identity(
  profile: CommunityFollowers['items'][number],
  signal: AbortSignal,
): HTMLElement {
  const link = el('a', '', 'community-follower');
  link.href = `#publico?handle=${encodeURIComponent(profile.handle)}`;
  const avatar = el(
    'span',
    profile.handle.slice(0, 2).toUpperCase(),
    'community-follower-avatar',
  );
  if (profile.avatar) {
    avatar.textContent = '';
    showPublicAvatar(avatar, {
      kind: 'avatar',
      target: profile.id,
      reference: profile.avatar,
      signal,
    });
  }
  link.append(avatar, el('strong', `@${profile.handle}`));
  return link;
}
async function read(
  input: FollowersAccess,
  kind: CommunityFollowerTab,
  after: string | null,
): Promise<CommunityFollowers> {
  return communityFollowers(
    input.signedIn
      ? await input.controller.request('followers-page', {
          id: input.id,
          tab: kind,
          after,
        })
      : await communityRead(
          `/api/communities/${input.id}/followers${after ? `?after=${encodeURIComponent(after)}` : ''}`,
          input.signal,
        ),
  );
}
/** The existing follower count opens its own page; common members preview below it. */
export function mountCommunityFollowerPreview(
  host: HTMLElement,
  input: FollowersAccess & { total: number },
): void {
  const section = el('section', '', 'community-followers'),
    count = el(
      'a',
      `${input.total.toLocaleString('pt-BR')} ${input.total === 1 ? 'seguidor' : 'seguidores'}`,
      'community-followers-link',
    );
  count.href = `#comunidades?id=${input.id}&view=followers`;
  section.append(count);
  host.append(section);
  if (!input.signedIn) return;
  const preview = el('div', '', 'community-known-followers');
  section.append(preview);
  void read(input, 'known', null)
    .then((page) => {
      if (input.signal.aborted || !section.isConnected || !page.items.length)
        return;
      preview.append(
        el('span', 'Seguida por '),
        ...page.items
          .slice(0, 3)
          .map((profile) => identity(profile, input.signal)),
      );
      if (page.total > 3)
        preview.append(
          el('span', `e mais ${page.total - 3} perfis que você segue`),
        );
    })
    .catch(() => {
      if (!input.signal.aborted)
        preview.textContent =
          'Não foi possível conferir os perfis em comum. Abra os seguidores para tentar novamente.';
    });
}
/** Separate page with a public roster and signed personalized tab. */
export function mountCommunityFollowerPage(
  host: HTMLElement,
  input: FollowersAccess & { name: string },
): void {
  const panel = el('section', '', 'community-followers-panel'),
    back = el('a', `← ${input.name}`),
    tabs = el('nav'),
    list = el('div', '', 'community-followers-list'),
    status = el('p'),
    more = el('button', 'Ver mais');
  back.href = `#comunidades?id=${input.id}`;
  more.type = 'button';
  tabs.setAttribute('aria-label', 'Listas de seguidores');
  status.setAttribute('role', 'status');
  more.hidden = true;
  let tab: CommunityFollowerTab = 'all',
    next: string | null = null,
    generation = 0,
    loading = false;
  const usable = () => !input.signal.aborted && panel.isConnected;
  function paint(page: CommunityFollowers, append: boolean): void {
    if (!append) list.replaceChildren();
    list.append(
      ...page.items.map((profile) => identity(profile, input.signal)),
    );
    next = page.next;
    more.hidden = !next;
    status.textContent = page.total
      ? `${page.total.toLocaleString('pt-BR')} ${tab === 'known' ? 'perfis que você segue nesta comunidade' : page.total === 1 ? 'seguidor' : 'seguidores'}`
      : 'Nenhum perfil nesta lista.';
  }
  async function load(append: boolean): Promise<void> {
    const current = ++generation;
    loading = true;
    more.disabled = true;
    status.textContent = 'Carregando seguidores…';
    try {
      const page = await read(input, tab, append ? next : null);
      if (!usable() || current !== generation) return;
      paint(page, append);
    } catch (error: unknown) {
      if (usable() && current === generation)
        status.textContent =
          error instanceof Error ? error.message : 'Seguidores indisponíveis.';
    } finally {
      if (current === generation) {
        loading = false;
        more.disabled = false;
      }
    }
  }
  const buttons: Array<{
    kind: CommunityFollowerTab;
    button: HTMLButtonElement;
  }> = [];
  for (const [kind, label] of [
    ['all', 'Seguidores'],
    ['known', 'Perfis que você segue'],
  ] as const) {
    if (kind === 'known' && !input.signedIn) continue;
    const button = el('button', label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(kind === tab));
    button.addEventListener('click', () => {
      tab = kind;
      for (const entry of buttons)
        entry.button.setAttribute('aria-pressed', String(entry.kind === tab));
      void load(false);
    });
    tabs.append(button);
    buttons.push({ kind, button });
  }
  more.addEventListener('click', () => {
    if (!loading && next) void load(true);
  });
  panel.append(back, el('h1', input.name), tabs, list, status, more);
  host.append(panel);
  void load(false);
}
