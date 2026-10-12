import { watchProfileShortcuts } from '../profile-shortcut/index.ts';
import { ownPublicProfile } from '../../shared/public-profile/index.ts';
import type { OwnPublicProfile } from '../../shared/public-profile/index.ts';
import type { PublicProfiles } from './controller.ts';
import { showPublicAvatar } from '../public-media/index.ts';
export function startOwnProfileShortcut(controller: PublicProfiles) {
  let generation = 0;
  let lifetime = new AbortController();
  let pending: number | null = null;
  let fetched: OwnPublicProfile | null = null;
  let loaded = false;
  function paint(): void {
    lifetime.abort();
    lifetime = new AbortController();
    const own = (controller.profile ?? fetched)?.profile;
    document
      .querySelectorAll<HTMLAnchorElement>('[data-own-public-profile]')
      .forEach((link) => {
        link.hidden = !own;
        link.replaceChildren();
        if (!own) return;
        link.href = `#publico?handle=${encodeURIComponent(own.handle)}`;
        link.setAttribute('aria-label', 'Abrir meu perfil público');
        link.title = `@${own.handle}`;
        link.textContent = own.avatar
          ? ''
          : own.handle.slice(0, 2).toLocaleUpperCase('pt-BR');
        if (own.avatar)
          showPublicAvatar(link, {
            kind: 'avatar',
            target: own.id,
            reference: own.avatar,
            signal: lifetime.signal,
          });
      });
  }
  watchProfileShortcuts(paint);
  return {
    paint,
    clear(): void {
      generation++;
      loaded = false;
      pending = null;
      fetched = null;
      paint();
    },
    ready(): void {
      if (pending !== null || loaded || !controller.hasSession()) return;
      const current = generation;
      pending = current;
      void controller
        .perform('state', {})
        .then((data) => {
          if (current !== generation) return;
          fetched = ownPublicProfile(data);
          loaded = true;
          paint();
        })
        .catch(() => {
          // A failed public identity read hides this optional shortcut until retry.
          if (current === generation) paint();
        })
        .finally(() => {
          if (pending === current) pending = null;
        });
    },
  };
}
