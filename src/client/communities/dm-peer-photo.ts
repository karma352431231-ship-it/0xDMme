import { paintAvatar } from '../appearance/index.ts';
import { ChatAvatarPhoto } from '../chat-ui/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';

const photos = new WeakMap<
  HTMLElement,
  {
    key: string;
    parent: AbortSignal;
    stop: () => void;
  }
>();
/** Same header viewer as private chats, fed only an approved public avatar. */
export function paintDmAvatar(
  host: HTMLButtonElement,
  profile: PublicProfile,
  signal: AbortSignal,
): void {
  const key = `${profile.id}:${profile.avatar ?? ''}`,
    previous = photos.get(host);
  if (previous?.key === key && previous.parent === signal) return;
  previous?.stop();
  const lifetime = new AbortController(),
    active = AbortSignal.any([signal, lifetime.signal]),
    viewer = new ChatAvatarPhoto(),
    ready = viewer.bind({ trigger: host, peer: profile.id, signal: active });
  host.replaceChildren();
  paintAvatar(host, { label: profile.handle, seed: profile.id });
  const stop = profile.avatar
    ? showPublicAvatar(host, {
        kind: 'avatar',
        target: profile.id,
        reference: profile.avatar,
        signal: active,
        ready,
      })
    : () => {};
  photos.set(host, {
    key,
    parent: signal,
    stop: () => {
      lifetime.abort();
      viewer.clear();
      stop();
    },
  });
}
