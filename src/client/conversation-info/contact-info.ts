import { t } from '../../shared/i18n/index.ts';
import { paintAvatar, shortAddress } from '../appearance/index.ts';
import { menuIcon } from '../menu-icons/index.ts';
import { infoActionBar } from './actions.ts';
import type { InfoAction } from './actions.ts';
import { MuteRow } from './mute.ts';
import type { MutePort } from './mute.ts';

/** What the panel shows about one private (wallet) contact. */
export interface ContactInfo {
  title: string;
  address: string;
  /** Paints the contact's photo into the large avatar; aborted on close. */
  photo?: (host: HTMLElement, signal: AbortSignal) => void;
  call?: () => void;
  search: () => void;
  edit?: () => void;
  mute?: MutePort;
}

/**
 * "Contact info" for a private conversation, opened from the chat header.
 * Owns its dialog, the photo request and the mute row of the open panel; every
 * action goes back to the owner of that operation through `ContactInfo`.
 */
export class ContactInfoDialog {
  private readonly dialog = document.createElement('dialog');
  private photo: AbortController | null = null;
  private mute: MuteRow | null = null;
  constructor() {
    this.dialog.className = 'info-dialog';
    this.dialog.setAttribute('aria-label', t('Contact info'));
    this.dialog.addEventListener('close', () => this.release());
    this.dialog.addEventListener('click', (event) => {
      // A click on the backdrop lands on the dialog element itself.
      if (event.target === this.dialog) this.close();
    });
    document.body.append(this.dialog);
  }
  get open(): boolean {
    return this.dialog.open;
  }
  show(info: ContactInfo): void {
    this.release();
    this.dialog.replaceChildren(
      this.bar(info),
      this.hero(info),
      infoActionBar(this.actions(info)),
      ...this.rows(info),
      this.secure(),
    );
    if (!this.dialog.open) this.dialog.showModal();
  }
  close(): void {
    if (this.dialog.open) this.dialog.close();
    this.release();
  }
  private release(): void {
    this.photo?.abort();
    this.photo = null;
    this.mute?.dispose();
    this.mute = null;
  }
  private bar(info: ContactInfo): HTMLElement {
    const bar = document.createElement('header'),
      close = document.createElement('button'),
      title = document.createElement('h2');
    bar.className = 'info-bar';
    close.type = 'button';
    close.className = 'info-icon';
    close.setAttribute('aria-label', t('Close'));
    close.append(menuIcon('close'));
    close.addEventListener('click', () => this.close());
    title.textContent = t('Contact info');
    bar.append(close, title);
    if (info.edit) {
      const edit = document.createElement('button'),
        action = info.edit;
      edit.type = 'button';
      edit.className = 'info-icon';
      edit.setAttribute('aria-label', t('contacts.edit'));
      edit.title = t('contacts.edit');
      edit.append(menuIcon('edit'));
      edit.addEventListener('click', () => {
        this.close();
        action();
      });
      bar.append(edit);
    }
    return bar;
  }
  private hero(info: ContactInfo): HTMLElement {
    const hero = document.createElement('div'),
      avatar = document.createElement('span'),
      name = document.createElement('strong'),
      wallet = document.createElement('button');
    hero.className = 'info-hero';
    avatar.className = 'info-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    paintAvatar(avatar, { label: info.title, seed: info.address });
    if (info.photo) {
      this.photo = new AbortController();
      info.photo(avatar, this.photo.signal);
    }
    name.textContent = info.title;
    wallet.type = 'button';
    wallet.className = 'info-wallet';
    wallet.textContent = shortAddress(info.address);
    wallet.title = info.address;
    wallet.setAttribute('aria-label', t('Copy wallet {0}', [info.address]));
    wallet.append(menuIcon('copy'));
    wallet.addEventListener('click', () => void this.copy(wallet, info));
    hero.append(avatar, name, wallet);
    return hero;
  }
  private async copy(button: HTMLButtonElement, info: ContactInfo) {
    try {
      await navigator.clipboard.writeText(info.address);
      button.dataset['copied'] = 'true';
      button.title = t('Copied');
    } catch {
      button.title = t('Could not copy. Select the address instead.');
    }
  }
  private actions(info: ContactInfo): InfoAction[] {
    const actions: InfoAction[] = [];
    if (info.call) {
      const call = info.call;
      actions.push({
        id: 'call',
        label: t('Voice'),
        icon: 'phone',
        perform: () => {
          this.close();
          call();
        },
      });
    }
    actions.push({
      id: 'search',
      label: t('Search'),
      icon: 'search',
      perform: () => {
        this.close();
        info.search();
      },
    });
    return actions;
  }
  private rows(info: ContactInfo): HTMLElement[] {
    if (!info.mute) return [];
    this.mute = new MuteRow(info.mute);
    void this.mute.load();
    const list = document.createElement('div');
    list.className = 'info-list';
    list.append(this.mute.element);
    return [list];
  }
  private secure(): HTMLElement {
    const note = document.createElement('p');
    note.className = 'info-secure';
    note.append(
      menuIcon('lock'),
      document.createTextNode(t('Messages are end-to-end encrypted.')),
    );
    return note;
  }
}
