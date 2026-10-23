import { t } from '../../shared/i18n/index.ts';
import { paintAvatar, displayName } from '../appearance/index.ts';
import type { ProfileCard } from '../message-profile/index.ts';

export type GroupProfile = (account: string) => Promise<ProfileCard | null>;
/** How this viewer names a member. A name the viewer chose (their saved
 * nickname, or "You") is never replaced by the member's own profile name. */
export interface MemberLabel {
  text: string;
  chosen: boolean;
}
interface LoadedCard {
  name: string;
  url: string | null;
}
/** Owns decrypted avatar URLs, one card read per member and a bounded queue
 * for the current panel or conversation. */
export class GroupPeople {
  private readonly profile: GroupProfile;
  private epoch = 0;
  private running = 0;
  private queue: Array<() => Promise<void>> = [];
  private readonly urls = new Set<string>();
  private cards = new Map<string, Promise<LoadedCard | null>>();
  private readonly names = new Map<string, string>();
  constructor(profile: GroupProfile) {
    this.profile = profile;
  }
  clear(): void {
    this.epoch++;
    this.queue = [];
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    this.cards = new Map();
    this.names.clear();
  }
  /** The member's own profile name, once their card was read in this epoch. */
  knownName(account: string): string {
    return this.names.get(account) ?? '';
  }
  identity(account: string, label: MemberLabel, detail: string): HTMLElement {
    const identity = document.createElement('span'),
      avatar = document.createElement('span'),
      copy = document.createElement('span'),
      name = document.createElement('strong'),
      hint = document.createElement('small');
    identity.className = 'group-person';
    avatar.className = 'group-person-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    copy.className = 'group-person-copy';
    hint.textContent = detail;
    copy.append(name, hint);
    identity.append(avatar, copy);
    this.paint({ avatar, name }, account, label);
    return identity;
  }
  /** Author of an incoming group message: photo beside the bubble and name on
   * top, shown on the first message of a run from the same member. */
  sender(account: string, label: MemberLabel): HTMLElement[] {
    const avatar = document.createElement('span'),
      name = document.createElement('strong');
    avatar.className = 'group-person-avatar group-sender-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    name.className = 'group-sender-name';
    this.paint({ avatar, name }, account, label);
    return [avatar, name];
  }
  private paint(
    target: { avatar: HTMLElement; name: HTMLElement },
    account: string,
    label: MemberLabel,
  ): void {
    const show = (text: string) => {
      target.name.textContent = displayName(text);
      paintAvatar(target.avatar, { label: text, seed: account });
    };
    show(label.text);
    const epoch = this.epoch;
    void this.card(account)
      .then((card) => {
        // Rows may attach after a cached card resolves; only a newer epoch
        // (another group, session or panel) discards the result.
        if (!card || epoch !== this.epoch) return;
        if (card.name && !label.chosen) show(card.name);
        if (!card.url) return;
        const image = document.createElement('img');
        image.alt = '';
        image.src = card.url;
        target.avatar.replaceChildren(image);
      })
      .catch(() => {
        if (epoch === this.epoch)
          target.avatar.title = t('Private photo unavailable on this device.');
      });
  }
  /** One local card read per member and epoch, at most four at a time. */
  private card(account: string): Promise<LoadedCard | null> {
    const cached = this.cards.get(account);
    if (cached) return cached;
    const epoch = this.epoch;
    const loaded = new Promise<LoadedCard | null>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const card = await this.profile(account);
          if (epoch !== this.epoch || !card) {
            resolve(null);
            return;
          }
          const url = card.photo
            ? URL.createObjectURL(
                new Blob([card.photo.bytes], { type: card.photo.type }),
              )
            : null;
          if (url) this.urls.add(url);
          if (card.name) this.names.set(account, card.name);
          resolve({ name: card.name, url });
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
    this.cards.set(account, loaded);
    queueMicrotask(() => this.pump());
    return loaded;
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
