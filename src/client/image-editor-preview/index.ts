import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';

type Image = PendingPublicAvatar | null;
function sameImage(left: Image, right: Image): boolean {
  if (left === right) return true;
  if (!left || !right || left.type !== right.type) return false;
  return (
    left.bytes.length === right.bytes.length &&
    left.bytes.every((byte, index) => byte === right.bytes[index])
  );
}

/** Each preview owns its URL and keeps unchanged bytes mounted across reads. */
export class EditorImagePreview {
  private readonly host: HTMLElement;
  private readonly fixed: HTMLImageElement | null;
  private photo: Image = null;
  private reference: string | null = null;
  private initialized = false;
  private url: string | null = null;
  private lifetime = new AbortController();
  constructor(host: HTMLElement, fixed: HTMLImageElement | null = null) {
    this.host = host;
    this.fixed = fixed;
  }
  show(
    photo: Image,
    fallback: { target: string; reference: string } | null = null,
  ) {
    const reference = photo ? null : (fallback?.reference ?? null);
    if (this.matches(photo, reference)) return;
    this.clear();
    this.initialized = true;
    this.photo = photo;
    this.reference = reference;
    if (fallback && !photo) {
      this.host.replaceChildren();
      showPublicAvatar(this.host, {
        kind: 'avatar',
        ...fallback,
        signal: this.lifetime.signal,
      });
      return;
    }
    this.paintLocal(photo);
  }
  private matches(photo: Image, reference: string | null): boolean {
    return (
      this.initialized &&
      sameImage(this.photo, photo) &&
      this.reference === reference
    );
  }
  private paintLocal(photo: Image): void {
    const image = this.fixed ?? document.createElement('img');
    image.alt = '';
    image.hidden = !photo;
    if (photo) {
      this.url = URL.createObjectURL(
        new Blob([photo.bytes], { type: photo.type }),
      );
      image.src = this.url;
    } else image.removeAttribute('src');
    if (!this.fixed) this.host.replaceChildren(photo ? image : '@');
  }
  clear(): void {
    this.lifetime.abort();
    this.lifetime = new AbortController();
    if (this.url) URL.revokeObjectURL(this.url);
    if (this.fixed) {
      this.fixed.removeAttribute('src');
      this.fixed.hidden = true;
    } else this.host.replaceChildren();
    this.url = null;
    this.photo = null;
    this.reference = null;
    this.initialized = false;
  }
}
