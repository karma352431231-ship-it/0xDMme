import { localGet } from '../message-storage/index.ts';
import type { ProfileCard } from '../message-profile/index.ts';

type PhotoHost = HTMLElement;

/**
 * Private contact photos come only from the contact's verified profile card
 * already received on this device (never a public lookup). A card is decrypted
 * once per version: the cheap local pointer and removal mark form the key, so
 * the list and the conversation header share one object URL until the contact
 * sends a new card.
 */
export class PeerPhotos {
  private readonly cache = new Map<
    string,
    { key: string; url: Promise<string | null> }
  >();
  /** Last resolved URL per contact, painted at once to avoid an initials flash. */
  private readonly shown = new Map<string, string>();
  private readonly hosts = new WeakMap<PhotoHost, { initials: string }>();
  private scope: string | null = null;
  private readonly options: {
    scope: () => string | null;
    load: (peer: string) => Promise<ProfileCard | null>;
  };
  constructor(options: PeerPhotos['options']) {
    this.options = options;
  }

  /** Covers the initials in `host` with the photo when one exists. */
  show(
    host: PhotoHost,
    peer: string,
    signal: AbortSignal,
    ready?: (url: string | null) => void,
  ): void {
    if (signal.aborted) return;
    const scope = this.options.scope();
    const request = {
      initials: host.querySelector('img')
        ? (this.hosts.get(host)?.initials ?? '')
        : (host.textContent ?? ''),
    };
    this.hosts.set(host, request);
    const current = () =>
      this.hosts.get(host) === request &&
      !signal.aborted &&
      scope === this.options.scope() &&
      host.isConnected;
    const fallback = () => {
      if (host.querySelector('img')) host.textContent = request.initials;
    };
    const last = this.shown.get(peer);
    if (scope !== this.scope) fallback();
    if (last && scope === this.scope) {
      paint(host, last);
      ready?.(last);
    }
    void this.url(peer).then(
      (url) => {
        if (!current()) return;
        if (url) this.shown.set(peer, url);
        else this.shown.delete(peer);
        if (url) paint(host, url);
        else fallback();
        ready?.(url);
      },
      // Without a readable card the initials stay; nothing private is shown.
      () => {
        if (!current()) return;
        this.shown.delete(peer);
        fallback();
        ready?.(null);
      },
    );
  }

  clear(): void {
    this.shown.clear();
    for (const entry of this.cache.values())
      void entry.url.then(
        (url) => {
          if (url) URL.revokeObjectURL(url);
        },
        () => undefined,
      );
    this.cache.clear();
  }

  private async url(peer: string): Promise<string | null> {
    const scope = this.options.scope();
    if (scope !== this.scope) {
      this.clear();
      this.scope = scope;
    }
    if (!scope) return null;
    const key = await this.version(scope, peer);
    const cached = this.cache.get(peer);
    if (cached?.key === key) return cached.url;
    const url = this.options
      .load(peer)
      .then((card) =>
        card?.photo
          ? URL.createObjectURL(
              new Blob([card.photo.bytes], { type: card.photo.type }),
            )
          : null,
      );
    this.cache.set(peer, { key, url });
    // The previous URL may still be on screen; release it once the new one exists.
    if (cached)
      void url
        .then(
          () => cached.url,
          () => cached.url,
        )
        .then(
          (old) => {
            if (old) URL.revokeObjectURL(old);
          },
          () => undefined,
        );
    // A failed read is retried on the next paint instead of being remembered.
    url.catch(() => {
      if (this.cache.get(peer)?.url === url) this.cache.delete(peer);
    });
    return url;
  }

  private async version(scope: string, peer: string): Promise<string> {
    const [current, removed] = await Promise.all([
      localGet<string>(scope, `profile-current:${peer}:false`),
      localGet<number>(scope, `profile-tombstone:${peer}:false`),
    ]);
    return `${current ?? ''}:${removed ?? ''}`;
  }
}

function paint(host: PhotoHost, url: string): void {
  if (host.querySelector<HTMLImageElement>('img')?.src === url) return;
  const image = document.createElement('img');
  image.src = url;
  image.alt = '';
  host.replaceChildren(image);
}
