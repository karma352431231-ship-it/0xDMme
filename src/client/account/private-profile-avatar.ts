import { t } from '../../shared/i18n/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { paintAvatar } from '../appearance/index.ts';
import type { PrivateProfile } from '../account-profile/index.ts';

/** One local photo URL for the account card, desktop rail and mobile profile tab. */
export class PrivateProfileAvatar {
  private photo: PrivateProfile['photo'] = null;
  private url: string | null = null;
  private failed = false;
  private hosts: HTMLElement[] = [];
  private session: AccountSession | null = null;

  render(input: {
    hosts: HTMLElement[];
    photo: PrivateProfile['photo'];
    session: AccountSession | null;
  }): void {
    if (input.photo !== this.photo) {
      if (this.url) URL.revokeObjectURL(this.url);
      this.photo = input.photo;
      this.url = this.photo
        ? URL.createObjectURL(
            new Blob([this.photo.bytes], { type: this.photo.type }),
          )
        : null;
      this.failed = false;
    }
    this.hosts = input.hosts;
    this.session = input.session;
    for (const host of this.hosts) this.paint(host);
  }

  clear(): void {
    this.render({ hosts: this.hosts, photo: null, session: null });
    this.hosts = [];
  }

  private fallback(host: HTMLElement): void {
    paintAvatar(host, {
      label: this.session?.name || this.session?.address || '#',
      seed: this.session?.address || '',
    });
    if (!this.session) delete host.dataset['tone'];
  }

  private paint(host: HTMLElement): void {
    const url = this.url;
    if (!url || this.failed) {
      this.fallback(host);
      return;
    }
    if (host.querySelector('img')?.getAttribute('src') === url) return;
    const image = document.createElement('img');
    image.alt = t('Your profile photo');
    image.src = url;
    image.addEventListener(
      'error',
      () => {
        if (this.url !== url) return;
        this.failed = true;
        for (const host of this.hosts) this.fallback(host);
      },
      { once: true },
    );
    host.replaceChildren(image);
  }
}
