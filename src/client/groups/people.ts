import { paintAvatar, displayName } from '../appearance/index.ts';
import type { ProfileCard } from '../message-profile/index.ts';

export type GroupProfile = (account: string) => Promise<ProfileCard | null>;
/** Owns decrypted avatar URLs and a bounded queue for the current panel. */
export class GroupPeople {
  private readonly profile: GroupProfile;
  private epoch = 0;
  private running = 0;
  private queue: Array<() => Promise<void>> = [];
  private readonly urls = new Set<string>();
  constructor(profile: GroupProfile) {
    this.profile = profile;
  }
  clear(): void {
    this.epoch++;
    this.queue = [];
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
  }
  identity(account: string, label: string, detail: string): HTMLElement {
    const identity = document.createElement('span'),
      avatar = document.createElement('span'),
      copy = document.createElement('span'),
      name = document.createElement('strong'),
      hint = document.createElement('small');
    identity.className = 'group-person';
    avatar.className = 'group-person-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    paintAvatar(avatar, { label, seed: account });
    copy.className = 'group-person-copy';
    name.textContent = displayName(label);
    hint.textContent = detail;
    copy.append(name, hint);
    identity.append(avatar, copy);
    const epoch = this.epoch;
    this.queue.push(async () => {
      try {
        if (!this.usable(identity, epoch)) return;
        const card = await this.profile(account);
        if (!this.usable(identity, epoch) || !card?.photo) return;
        const url = URL.createObjectURL(
          new Blob([card.photo.bytes], { type: card.photo.type }),
        );
        this.urls.add(url);
        const image = document.createElement('img');
        image.alt = '';
        image.src = url;
        avatar.replaceChildren(image);
      } catch {
        if (this.usable(identity, epoch))
          avatar.title = 'Foto privada indisponível neste aparelho.';
      }
    });
    queueMicrotask(() => this.pump());
    return identity;
  }
  private usable(node: HTMLElement, epoch: number): boolean {
    const dialog = node.closest('dialog');
    return epoch === this.epoch && node.isConnected && (!dialog || dialog.open);
  }
  private pump(): void {
    while (this.running < 4 && this.queue.length) {
      const load = this.queue.shift()!;
      this.running++;
      void load().finally(() => {
        this.running--;
        this.pump();
      });
    }
  }
}
