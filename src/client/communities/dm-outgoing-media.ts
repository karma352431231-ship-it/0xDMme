import type { AcceptedDmMedia, DmMediaAccepted } from '../social-dm/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import { outgoingTextRows } from '../text-send/index.ts';
interface AcceptedPreview {
  message: AcceptedDmMedia;
  createdAt: number;
  bytes: Uint8Array<ArrayBuffer> | null;
  thumbnail: Uint8Array<ArrayBuffer> | null;
  url: string | null;
  size: number;
}
/** Session-only accepted attachment projections. This owner retains preview
 * bytes until verified presentation takes ownership; uploads/history own all
 * durable data. At most 64 rows and eight MiB, with accepted-only eviction. */
export class DmOutgoingMedia {
  private readonly held = new Map<string, AcceptedPreview>();
  private bytes = 0;
  private generation = 0;
  private readonly changed: () => void;
  constructor(changed: () => void) {
    this.changed = changed;
  }
  acceptance(selection: AttachmentSelection | null): DmMediaAccepted {
    const generation = this.generation,
      createdAt = Date.now();
    return (message) => {
      if (generation !== this.generation) return;
      if (this.held.has(message.id)) return;
      const bytes = selection ? selection.bytes.slice() : null;
      const thumbnail = selection?.thumbnail?.slice() ?? null;
      const size =
        (bytes ? bytes.length * 2 : 0) +
        (thumbnail ? thumbnail.length : 0) +
        new TextEncoder().encode(JSON.stringify(message)).length;
      this.held.set(message.id, {
        message,
        createdAt,
        bytes,
        thumbnail,
        size,
        url: null,
      });
      this.bytes += size;
      this.trim();
      this.changed();
    };
  }
  rows(peer: string, shown: ReadonlySet<string>) {
    return [...this.held.values()]
      .filter((held) => held.message.peer === peer)
      .flatMap((held) => {
        const { message, createdAt } = held;
        return outgoingTextRows({
          drafts: [
            {
              id: message.id,
              peer,
              text: message.content.caption,
              createdAt,
              saved: true,
              accepted: true,
              failure: null,
            },
          ],
          shown,
          quote: () => undefined,
          retry: () => {},
        }).map((row) => ({
          ...row,
          key: JSON.stringify(['accepted-media', message]),
          render: () => this.render(row.render(), held),
        }));
      });
  }
  private render(article: HTMLElement, held: AcceptedPreview): HTMLElement {
    article.dataset['outgoingMedia'] = 'true';
    if (held.bytes && held.message.content.image) {
      held.url ??= URL.createObjectURL(
        new Blob([held.bytes], { type: held.message.content.type }),
      );
      const frame = document.createElement('div'),
        image = document.createElement('img');
      frame.className = 'chat-image-frame';
      image.src = held.url;
      image.alt = held.message.content.name;
      frame.append(image);
      article.insertBefore(frame, article.querySelector('p'));
    }
    return article;
  }
  /** Transfer a fresh buffer to verified AttachmentUi. It now owns display,
   * cancellation and disposal; temporary upload entries are no prerequisite. */
  take(
    id: string,
    thumbnail: boolean,
    fileHash: string,
  ): Uint8Array<ArrayBuffer> | null {
    const held = this.held.get(id);
    if (held?.message.content.file.ref.hash !== fileHash) return null;
    const bytes = thumbnail ? held?.thumbnail : held?.bytes;
    if (!bytes) return null;
    const result = bytes.slice();
    this.remove(id);
    return result;
  }
  private trim(): void {
    while (this.held.size > 64 || this.bytes > 8 * 1024 * 1024) {
      const first = this.held.keys().next().value;
      if (first === undefined) return;
      this.remove(first);
    }
  }
  private remove(id: string): void {
    const held = this.held.get(id);
    if (!held) return;
    held.bytes?.fill(0);
    held.thumbnail?.fill(0);
    if (held.url) URL.revokeObjectURL(held.url);
    this.bytes -= held.size;
    this.held.delete(id);
  }
  reset(): void {
    this.generation++;
    for (const id of this.held.keys()) this.remove(id);
  }
}
